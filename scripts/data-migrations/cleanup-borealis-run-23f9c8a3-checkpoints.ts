import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  S3Client,
  type ObjectIdentifier,
  type ObjectVersion,
} from "@aws-sdk/client-s3";

const BUCKET = "piro-kb";
const RUN_ID = "23f9c8a3-0da1-4c7f-b42f-22d2b2721b05";
const PREFIX = `checkpoints/${RUN_ID}/`;
const RETAIN_STEPS = 5;
const DELETE_BATCH_SIZE = 1_000;

type VersionEntry = Pick<
  ObjectVersion,
  "Key" | "VersionId" | "LastModified" | "Size" | "IsLatest"
> & {
  isDeleteMarker: boolean;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getClient(): S3Client {
  const endpoint = requiredEnv("BUCKET_ENDPOINT_URL");
  return new S3Client({
    region: "auto",
    endpoint: endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
    credentials: {
      accessKeyId: requiredEnv("BUCKET_KEY_ID"),
      secretAccessKey: requiredEnv("BUCKET_APPLICATION_SECRET"),
    },
    forcePathStyle: true,
  });
}

async function listAllVersions(client: S3Client): Promise<VersionEntry[]> {
  const entries: VersionEntry[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  for (;;) {
    const page = await client.send(
      new ListObjectVersionsCommand({
        Bucket: BUCKET,
        Prefix: PREFIX,
        ...(keyMarker ? { KeyMarker: keyMarker } : {}),
        ...(versionIdMarker ? { VersionIdMarker: versionIdMarker } : {}),
      }),
    );
    for (const version of page.Versions ?? []) {
      entries.push({ ...version, isDeleteMarker: false });
    }
    for (const marker of page.DeleteMarkers ?? []) {
      entries.push({ ...marker, isDeleteMarker: true });
    }
    if (!page.IsTruncated) break;
    if (!page.NextKeyMarker || !page.NextVersionIdMarker) {
      throw new Error(
        "Backblaze returned an incomplete version continuation marker",
      );
    }
    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
  }
  return entries;
}

function stepForKey(key: string): number {
  const match = new RegExp(
    `^${PREFIX.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}step-(\\d+)\\.pt$`,
  ).exec(key);
  if (!match) throw new Error(`Unexpected checkpoint key: ${key}`);
  return Number(match[1]);
}

function describe(entry: VersionEntry): string {
  const kind = entry.isDeleteMarker
    ? "delete marker"
    : `${entry.Size ?? 0} bytes`;
  return `${entry.Key} @ ${entry.VersionId} (${kind})`;
}

async function deleteEntries(
  client: S3Client,
  entries: VersionEntry[],
): Promise<void> {
  for (let offset = 0; offset < entries.length; offset += DELETE_BATCH_SIZE) {
    const batch = entries.slice(offset, offset + DELETE_BATCH_SIZE);
    const objects: ObjectIdentifier[] = batch.map((entry) => ({
      Key: entry.Key,
      VersionId: entry.VersionId,
    }));
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: objects, Quiet: false },
      }),
    );
    if ((result.Errors?.length ?? 0) > 0) {
      throw new Error(
        `Backblaze rejected deletions: ${JSON.stringify(result.Errors)}`,
      );
    }
    if ((result.Deleted?.length ?? 0) !== batch.length) {
      throw new Error(
        `Backblaze confirmed ${result.Deleted?.length ?? 0} deletions, expected ${batch.length}`,
      );
    }
    console.log(
      `Deleted ${Math.min(offset + batch.length, entries.length)}/${entries.length} versions`,
    );
  }
}

async function main(): Promise<void> {
  const client = getClient();
  const entries = await listAllVersions(client);
  const byKey = new Map<string, VersionEntry[]>();
  for (const entry of entries) {
    if (!entry.Key || !entry.VersionId)
      throw new Error("Version lacks key or version id");
    const versions = byKey.get(entry.Key) ?? [];
    versions.push(entry);
    byKey.set(entry.Key, versions);
  }

  const keys = [...byKey.keys()];
  const steps = [...new Set(keys.map(stepForKey))].sort((a, b) => b - a);
  const retainedSteps = new Set(steps.slice(0, RETAIN_STEPS));
  const deletions: VersionEntry[] = [];
  const retained: VersionEntry[] = [];

  for (const [key, versions] of byKey) {
    const step = stepForKey(key);
    if (!retainedSteps.has(step)) {
      deletions.push(...versions);
      continue;
    }
    const liveVersions = versions
      .filter((version) => !version.isDeleteMarker)
      .sort(
        (a, b) =>
          (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
      );
    if (liveVersions.length === 0)
      throw new Error(`No live version remains for retained step ${step}`);
    retained.push(liveVersions[0]);
    deletions.push(
      ...versions.filter((version) => version !== liveVersions[0]),
    );
  }

  console.log(`Bucket: ${BUCKET}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log(
    `Found ${entries.length} stored versions across ${keys.length} checkpoint keys`,
  );
  console.log(
    `Retaining steps: ${[...retainedSteps].sort((a, b) => b - a).join(", ") || "none"}`,
  );
  console.log(`Permanently deleting ${deletions.length} versions`);
  for (const entry of deletions.slice(0, 25))
    console.log(`  ${describe(entry)}`);
  if (deletions.length > 25) console.log(`  … ${deletions.length - 25} more`);

  await deleteEntries(client, deletions);

  const remaining = await listAllVersions(client);
  const remainingKeys = new Set(remaining.map((entry) => entry.Key));
  const remainingSteps = [...remainingKeys]
    .map(stepForKey)
    .sort((a, b) => b - a);
  if (
    remaining.length !== retained.length ||
    remainingSteps.some((step) => !retainedSteps.has(step))
  ) {
    throw new Error(
      `Verification failed: expected ${retained.length} versions for retained steps, found ${remaining.length} records for steps ${remainingSteps.join(", ")}`,
    );
  }
  console.log(
    `Verified: ${remaining.length} live checkpoint versions remain for steps ${remainingSteps.join(", ")}`,
  );
}

await main();
