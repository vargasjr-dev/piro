import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

function getR2Client(): S3Client {
  const endpoint = process.env.BUCKET_ENDPOINT_URL;
  const accessKeyId = process.env.BUCKET_KEY_ID;
  const secretAccessKey = process.env.BUCKET_APPLICATION_SECRET;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    const missing = [
      !endpoint && "BUCKET_ENDPOINT_URL",
      !accessKeyId && "BUCKET_KEY_ID",
      !secretAccessKey && "BUCKET_APPLICATION_SECRET",
    ].filter(Boolean);
    throw new Error(`Storage credentials missing: ${missing.join(", ")}`);
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false, // B2 supports virtual-hosted style; set true if ListObjects fails
  });
}

const BUCKET = () => "piro-kb";

/**
 * Write a file to R2. Idempotent — same key overwrites with same content.
 * key format: {userId}/data/{provider}/{...path}.md
 */
export async function r2Put(key: string, content: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: content,
      ContentType: "text/markdown; charset=utf-8",
    })
  );
}

/**
 * Delete all objects under a given prefix.
 * Used when an integration is disconnected.
 */
export async function r2DeletePrefix(prefix: string): Promise<void> {
  const client = getR2Client();
  const bucket = BUCKET();

  let continuationToken: string | undefined;

  do {
    const list: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));

    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys, Quiet: true },
        })
      );
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
}

/**
 * Build the R2 key for a given user + provider + relative path.
 * e.g. r2Key("user123", "github", "owner/repo/commits/abc.md")
 *       → "user123/data/github/owner/repo/commits/abc.md"
 */
export function r2Key(userId: string, provider: string, relativePath: string): string {
  return `${userId}/data/${provider}/${relativePath}`;
}

/**
 * The R2 prefix for all of a user's data under one provider.
 * Used when disconnecting an integration.
 */
export function r2ProviderPrefix(userId: string, provider: string): string {
  return `${userId}/data/${provider}/`;
}

/**
 * List all objects under a prefix. Returns keys with the userId stripped,
 * so callers see paths rooted at "data/..." (i.e. the user's virtual /data/).
 */
export async function r2List(userId: string): Promise<string[]> {
  const client = getR2Client();
  const bucket = BUCKET();
  const prefix = `${userId}/`;
  const paths: string[] = [];

  let continuationToken: string | undefined;

  do {
    const list: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of list.Contents ?? []) {
      if (obj.Key) {
        // Strip the userId/ prefix so callers see "data/github/..."
        paths.push(obj.Key.slice(prefix.length));
      }
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  return paths;
}
