import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  S3Client,
  type ObjectIdentifier,
  type ObjectVersion,
} from "@aws-sdk/client-s3";

const BUCKET = "piro-kb";
const DEFAULT_PREFIX = "checkpoints/";
const APPLY_CONFIRMATION = "DELETE_SUPERSEDED_CHECKPOINT_VERSIONS";
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

function entryKey(entry: VersionEntry): string {
  if (!entry.Key || !entry.VersionId) {
    throw new Error("Backblaze returned a version without a key or version id");
  }
  return `${entry.Key}\u0000${entry.VersionId}`;
}

async function listAllVersions(
  client: S3Client,
  prefix: string,
): Promise<VersionEntry[]> {
  const entries: VersionEntry[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  for (;;) {
    const page = await client.send(
      new ListObjectVersionsCommand({
        Bucket: BUCKET,
        Prefix: prefix,
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
        "Backblaze returned a truncated version page without continuation markers",
      );
    }
    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
  }

  return entries;
}

function selectSuperseded(entries: VersionEntry[]): {
  current: VersionEntry[];
  superseded: VersionEntry[];
} {
  const byKey = new Map<string, VersionEntry[]>();
  for (const entry of entries) {
    if (!entry.Key || !entry.VersionId) {
      throw new Error(
        "Backblaze returned a version without a key or version id",
      );
    }
    const versions = byKey.get(entry.Key) ?? [];
    versions.push(entry);
    byKey.set(entry.Key, versions);
  }

  const current: VersionEntry[] = [];
  const superseded: VersionEntry[] = [];
  for (const versions of byKey.values()) {
    const latest = versions.filter((entry) => entry.IsLatest);
    if (latest.length !== 1) {
      throw new Error(
        `Expected exactly one latest version for ${versions[0]?.Key ?? "unknown key"}; received ${latest.length}`,
      );
    }
    current.push(latest[0]);
    superseded.push(...versions.filter((entry) => !entry.IsLatest));
  }
  return { current, superseded };
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${bytes.toLocaleString()} bytes`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

function sumBytes(entries: VersionEntry[]): number {
  return entries.reduce((total, entry) => total + (entry.Size ?? 0), 0);
}

function logBackblazeTotals(label: string, entries: VersionEntry[]): void {
  const versions = entries.filter((entry) => !entry.isDeleteMarker);
  const deleteMarkers = entries.filter((entry) => entry.isDeleteMarker);
  console.log(`${label} (Backblaze ListObjectVersions):`);
  console.log(`  version records: ${versions.length.toLocaleString()}`);
  console.log(
    `  version bytes: ${sumBytes(versions).toLocaleString()} (${formatBytes(sumBytes(versions))})`,
  );
  console.log(`  delete markers: ${deleteMarkers.length.toLocaleString()}`);
  console.log(`  all records: ${entries.length.toLocaleString()}`);
}

function describe(entry: VersionEntry): string {
  const kind = entry.isDeleteMarker
    ? "delete marker"
    : formatBytes(entry.Size ?? 0);
  return `${entry.Key} @ ${entry.VersionId} (${kind})`;
}

async function deleteBatch(
  client: S3Client,
  entries: VersionEntry[],
): Promise<void> {
  const objects: ObjectIdentifier[] = entries.map((entry) => ({
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
      `Backblaze rejected ${result.Errors?.length} deletions: ${JSON.stringify(result.Errors)}`,
    );
  }
  if ((result.Deleted?.length ?? 0) !== entries.length) {
    throw new Error(
      `Backblaze confirmed ${result.Deleted?.length ?? 0} deletions, expected ${entries.length}`,
    );
  }
}

async function main(): Promise<void> {
  const prefix = process.env.B2_CLEANUP_PREFIX ?? DEFAULT_PREFIX;
  if (!prefix.endsWith("/"))
    throw new Error("B2_CLEANUP_PREFIX must end with '/'");

  const client = getClient();
  const entries = await listAllVersions(client, prefix);
  logBackblazeTotals("Before cleanup", entries);
  const { current, superseded } = selectSuperseded(entries);
  const supersededBytes = sumBytes(superseded);
  const apply = process.env.B2_CLEANUP_CONFIRM === APPLY_CONFIRMATION;

  console.log(`Bucket: ${BUCKET}`);
  console.log(`Prefix: ${prefix}`);
  console.log(`All versions and delete markers: ${entries.length}`);
  console.log(`Keys retained at latest version: ${current.length}`);
  console.log(`Superseded versions selected: ${superseded.length}`);
  console.log(
    `Approximate object bytes selected: ${formatBytes(supersededBytes)}`,
  );
  for (const entry of superseded.slice(0, 25))
    console.log(`  ${describe(entry)}`);
  if (superseded.length > 25) console.log(`  … ${superseded.length - 25} more`);

  if (!apply) {
    console.log(
      `DRY RUN: set B2_CLEANUP_CONFIRM=${APPLY_CONFIRMATION} to delete these versions.`,
    );
    return;
  }

  if (superseded.length === 0) {
    console.log("Nothing to delete; the cleanup is already complete.");
    return;
  }

  for (
    let offset = 0;
    offset < superseded.length;
    offset += DELETE_BATCH_SIZE
  ) {
    const batch = superseded.slice(offset, offset + DELETE_BATCH_SIZE);
    await deleteBatch(client, batch);
    console.log(
      `Deleted ${Math.min(offset + batch.length, superseded.length)}/${superseded.length}`,
    );
  }

  const remaining = await listAllVersions(client, prefix);
  logBackblazeTotals("After cleanup", remaining);
  const remainingSelection = selectSuperseded(remaining);
  if (remainingSelection.superseded.length !== 0) {
    throw new Error(
      `Verification failed: ${remainingSelection.superseded.length} superseded versions remain`,
    );
  }
  console.log(
    `Verified: ${remainingSelection.current.length} latest versions remain.`,
  );
}

await main();
