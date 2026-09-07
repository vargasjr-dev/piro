import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

const CONCURRENCY = Math.max(1, Number(process.env.MIGRATION_CONCURRENCY ?? "6"));
if (!Number.isInteger(CONCURRENCY)) {
  throw new Error("MIGRATION_CONCURRENCY must be an integer");
}

const LEGACY_S3_ENDPOINT_URL = requireEnv("LEGACY_S3_ENDPOINT_URL");
const LEGACY_S3_ACCESS_KEY_ID = requireEnv("LEGACY_S3_ACCESS_KEY_ID");
const LEGACY_S3_SECRET_ACCESS_KEY = requireEnv("LEGACY_S3_SECRET_ACCESS_KEY");
const LEGACY_S3_BUCKET = requireEnv("LEGACY_S3_BUCKET");

const S3_ENDPOINT_URL = requireEnv("S3_ENDPOINT_URL");
const S3_ACCESS_KEY_ID = requireEnv("S3_ACCESS_KEY_ID");
const S3_SECRET_ACCESS_KEY = requireEnv("S3_SECRET_ACCESS_KEY");
const S3_BUCKET = requireEnv("S3_BUCKET");

const legacyHost = hostnameFor(LEGACY_S3_ENDPOINT_URL);
const destinationHost = hostnameFor(S3_ENDPOINT_URL);
if (legacyHost === destinationHost) {
  throw new Error("LEGACY_S3_ENDPOINT_URL and S3_ENDPOINT_URL must be different providers");
}
if (destinationHost.endsWith(".backblazeb2.com")) {
  throw new Error("S3_ENDPOINT_URL must point to the destination, not Backblaze B2");
}

const legacy = makeS3Client(LEGACY_S3_ENDPOINT_URL, LEGACY_S3_ACCESS_KEY_ID, LEGACY_S3_SECRET_ACCESS_KEY);
const destination = makeS3Client(S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY);

type ObjectRow = { key: string; size: number; etag?: string };

const sourceObjects = await listAllObjects(legacy, LEGACY_S3_BUCKET);
const destinationBefore = await listAllObjects(destination, S3_BUCKET);
const destinationBeforeByKey = new Map(destinationBefore.map((object) => [object.key, object]));

const unexpectedDestination = destinationBefore.filter((object) => !sourceObjects.some((source) => source.key === object.key));
if (unexpectedDestination.length > 0) {
  throw new Error(
    `destination bucket already contains unrelated objects: ${unexpectedDestination.slice(0, 10).map((object) => object.key).join(", ")}`,
  );
}

const copied: string[] = [];
const skipped: string[] = [];
const failures: Array<{ key: string; message: string }> = [];

const workQueue = [...sourceObjects];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (workQueue.length > 0) {
    const source = workQueue.shift();
    if (!source) break;

    const existing = destinationBeforeByKey.get(source.key);
    if (existing) {
      if (existing.size !== source.size) {
        failures.push({
          key: source.key,
          message: `destination object already exists with different size: ${existing.size} != ${source.size}`,
        });
        continue;
      }

      skipped.push(source.key);
      continue;
    }

    try {
      await copyObject(source);
      copied.push(source.key);
    } catch (error) {
      failures.push({ key: source.key, message: error instanceof Error ? error.message : String(error) });
    }
  }
});

await Promise.all(workers);

if (failures.length > 0) {
  console.error(
    JSON.stringify({
      sourceBucket: LEGACY_S3_BUCKET,
      destinationBucket: S3_BUCKET,
      copied: copied.length,
      skipped: skipped.length,
      failed: failures.length,
      failures: failures.slice(0, 20),
    }),
  );
  throw new Error(`migration copied ${copied.length} objects but ${failures.length} failed`);
}

const destinationAfter = await listAllObjects(destination, S3_BUCKET);
const destinationAfterByKey = new Map(destinationAfter.map((object) => [object.key, object]));
const missingAfter = sourceObjects.filter((object) => {
  const copiedObject = destinationAfterByKey.get(object.key);
  return !copiedObject || copiedObject.size !== object.size;
});

if (missingAfter.length > 0) {
  throw new Error(`verification found ${missingAfter.length} missing or mismatched destination objects`);
}

console.log(
  JSON.stringify({
    sourceBucket: LEGACY_S3_BUCKET,
    destinationBucket: S3_BUCKET,
    sourceObjectCount: sourceObjects.length,
    copiedObjectCount: copied.length,
    skippedObjectCount: skipped.length,
    destinationObjectCount: destinationAfter.length,
    copiedBytes: sourceObjects
      .filter((object) => copied.includes(object.key))
      .reduce((total, object) => total + object.size, 0),
  }),
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function hostnameFor(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    throw new Error(`invalid S3 endpoint URL: ${endpoint}`);
  }
}

function makeS3Client(endpoint: string, accessKeyId: string, secretAccessKey: string): S3Client {
  const normalizedEndpoint = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
  return new S3Client({
    region: "auto",
    endpoint: normalizedEndpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function listAllObjects(client: S3Client, bucket: string): Promise<ObjectRow[]> {
  const objects: ObjectRow[] = [];
  const seenKeys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key) {
        throw new Error(`bucket ${bucket} returned an object without a key`);
      }
      if (seenKeys.has(object.Key)) {
        throw new Error(`bucket ${bucket} returned duplicate object key ${object.Key}`);
      }
      if (typeof object.Size !== "number") {
        throw new Error(`bucket ${bucket} returned no size for ${object.Key}`);
      }

      seenKeys.add(object.Key);
      objects.push({ key: object.Key, size: object.Size, etag: object.ETag });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

async function copyObject(source: ObjectRow): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "piro-b2-to-r2-"));
  const temporaryFile = join(temporaryDirectory, "object");

  try {
    const getResponse = await legacy.send(
      new GetObjectCommand({ Bucket: LEGACY_S3_BUCKET, Key: source.key }),
    );
    if (!getResponse.Body) {
      throw new Error("source object had no body");
    }

    await pipeline(getResponse.Body as Readable, createWriteStream(temporaryFile));
    const temporaryFileStat = await stat(temporaryFile);
    if (temporaryFileStat.size !== source.size) {
      throw new Error(`downloaded object size changed: ${temporaryFileStat.size} != ${source.size}`);
    }

    await destination.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: source.key,
        Body: createReadStream(temporaryFile),
        ContentLength: temporaryFileStat.size,
        ContentType: getResponse.ContentType,
        CacheControl: getResponse.CacheControl,
        ContentDisposition: getResponse.ContentDisposition,
        ContentEncoding: getResponse.ContentEncoding,
        ContentLanguage: getResponse.ContentLanguage,
        Metadata: getResponse.Metadata,
      }),
    );

    const head = await destination.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: source.key }),
    );
    if (head.ContentLength !== source.size) {
      throw new Error(`uploaded object size verification failed: ${head.ContentLength} != ${source.size}`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
