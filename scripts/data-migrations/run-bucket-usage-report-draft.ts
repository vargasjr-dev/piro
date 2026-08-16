import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3";

const BUCKET = "piro-kb";
const KEEP_CHECKPOINTS = 5;
const NON_IT_GEMMA_PREFIX =
  "models/google--gemma-3-270m/9b0cfec892e2bc2afd938c98eabe4e4a7b1e0ca1/";
const CHECKPOINT_PATTERN = /^checkpoints\/([^/]+)\/step-(\d+)\.pt$/;
const DELETE_BATCH_SIZE = 1_000;

type BucketObject = { key: string; size: number };
type Checkpoint = BucketObject & { runId: string; step: number };

function createClient(): S3Client {
  const endpoint = process.env.BUCKET_ENDPOINT_URL;
  const accessKeyId = process.env.BUCKET_KEY_ID;
  const secretAccessKey = process.env.BUCKET_APPLICATION_SECRET;
  const missing = [
    !endpoint && "BUCKET_ENDPOINT_URL",
    !accessKeyId && "BUCKET_KEY_ID",
    !secretAccessKey && "BUCKET_APPLICATION_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Storage credentials missing: ${missing.join(", ")}`);
  }

  return new S3Client({
    region: "auto",
    endpoint: endpoint!.startsWith("http") ? endpoint : `https://${endpoint}`,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
    forcePathStyle: true,
  });
}

async function listObjects(client: S3Client): Promise<BucketObject[]> {
  const objects: BucketObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of response.Contents ?? []) {
      if (object.Key) objects.push({ key: object.Key, size: object.Size ?? 0 });
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

function findCheckpoint(object: BucketObject): Checkpoint | null {
  const match = CHECKPOINT_PATTERN.exec(object.key);
  if (!match) return null;
  return { ...object, runId: match[1], step: Number(match[2]) };
}

function chooseObjectsToDelete(objects: BucketObject[]): {
  checkpointDeletes: Checkpoint[];
  gemmaDeletes: BucketObject[];
} {
  const checkpointsByRun = new Map<string, Checkpoint[]>();
  const gemmaDeletes: BucketObject[] = [];

  for (const object of objects) {
    const checkpoint = findCheckpoint(object);
    if (checkpoint) {
      const run = checkpointsByRun.get(checkpoint.runId) ?? [];
      run.push(checkpoint);
      checkpointsByRun.set(checkpoint.runId, run);
    }
    if (object.key.startsWith(NON_IT_GEMMA_PREFIX)) gemmaDeletes.push(object);
  }

  const checkpointDeletes = [...checkpointsByRun.values()].flatMap((run) =>
    run.sort((left, right) => right.step - left.step).slice(KEEP_CHECKPOINTS),
  );
  return { checkpointDeletes, gemmaDeletes };
}

function bytes(objects: BucketObject[]): number {
  return objects.reduce((total, object) => total + object.size, 0);
}

function formatBytes(value: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return index === 0
    ? `${value.toLocaleString("en-US")} B`
    : `${amount.toFixed(2)} ${units[index]}`;
}

async function deleteObjects(
  client: S3Client,
  objects: BucketObject[],
): Promise<void> {
  for (let index = 0; index < objects.length; index += DELETE_BATCH_SIZE) {
    const batch = objects.slice(index, index + DELETE_BATCH_SIZE);
    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: batch.map(({ key }): ObjectIdentifier => ({ Key: key })),
        },
      }),
    );
    if (response.Errors && response.Errors.length > 0) {
      throw new Error(
        `Bucket deletion returned ${response.Errors.length} error(s): ${JSON.stringify(response.Errors)}`,
      );
    }
    console.log(`Deleted ${batch.length.toLocaleString("en-US")} object(s).`);
  }
}

const client = createClient();
const objects = await listObjects(client);
const { checkpointDeletes, gemmaDeletes } = chooseObjectsToDelete(objects);
const deletes = [...checkpointDeletes, ...gemmaDeletes];

console.log(`Bucket: ${BUCKET}`);
console.log(
  `Objects before cleanup: ${objects.length.toLocaleString("en-US")}`,
);
console.log(
  `Checkpoint cleanup: ${checkpointDeletes.length.toLocaleString("en-US")} object(s), ${formatBytes(bytes(checkpointDeletes))}`,
);
console.log(
  `Non-IT Gemma cleanup: ${gemmaDeletes.length.toLocaleString("en-US")} object(s), ${formatBytes(bytes(gemmaDeletes))}`,
);
console.log(
  `Total scheduled for deletion: ${deletes.length.toLocaleString("en-US")}`,
);

if (deletes.length === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

await deleteObjects(client, deletes);
console.log(
  `Deleted ${deletes.length.toLocaleString("en-US")} object(s) total.`,
);
