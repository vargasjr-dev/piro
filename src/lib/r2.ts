import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
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

  // Normalize endpoint — ensure it has a scheme (B2 needs https://)
  const normalizedEndpoint = endpoint.startsWith("http")
    ? endpoint
    : `https://${endpoint}`;

  return new S3Client({
    region: "auto",
    endpoint: normalizedEndpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // Required for B2 S3-compatible API
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
 * Write any text file to R2 with a specified content type.
 * Use this for .py, .jsonl, .json, etc.
 */
export async function r2PutText(key: string, content: string, contentType: string): Promise<void> {
  await r2PutObject(key, content, contentType);
}

export async function r2PutObject(
  key: string,
  body: NonNullable<ConstructorParameters<typeof PutObjectCommand>[0]>["Body"],
  contentType: string,
  contentLength?: number,
): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
    }),
  );
}

export async function r2PutMultipart(
  key: string,
  parts: AsyncIterable<Buffer>,
  contentType: string,
): Promise<void> {
  const client = getR2Client();
  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET(),
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!created.UploadId) throw new Error("Object storage did not return an upload id");

  const completedParts: Array<{ ETag?: string; PartNumber: number }> = [];
  let partNumber = 1;
  try {
    for await (const part of parts) {
      const uploaded = await client.send(
        new UploadPartCommand({
          Bucket: BUCKET(),
          Key: key,
          UploadId: created.UploadId,
          PartNumber: partNumber,
          Body: part,
        }),
      );
      completedParts.push({ ETag: uploaded.ETag, PartNumber: partNumber });
      partNumber += 1;
    }

    if (completedParts.length === 0) throw new Error("Cannot upload an empty object");
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET(),
        Key: key,
        UploadId: created.UploadId,
        MultipartUpload: { Parts: completedParts },
      }),
    );
  } catch (error) {
    await client
      .send(
        new AbortMultipartUploadCommand({
          Bucket: BUCKET(),
          Key: key,
          UploadId: created.UploadId,
        }),
      )
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Read a single file from R2 and return its text content.
 * Returns null if the object does not exist.
 */
export async function r2Get(key: string): Promise<string | null> {
  const client = getR2Client();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
    if (!res.Body) return null;
    return await res.Body.transformToString("utf-8");
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && e.name === "NoSuchKey") return null;
    throw e;
  }
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
export async function r2ListPrefix(userId: string, subPrefix: string): Promise<string[]> {
  const client = getR2Client();
  const bucket = BUCKET();
  const prefix = `${userId}/${subPrefix}`;
  const paths: string[] = [];
  let continuationToken: string | undefined;
  do {
    const list: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken })
    );
    for (const obj of list.Contents ?? []) {
      if (obj.Key) paths.push(obj.Key.slice(`${userId}/`.length));
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return paths;
}

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
