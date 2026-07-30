import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { resolveRequestAuth } from "~/lib/request-auth";
import {
  encodeRepositoryFile,
  huggingFaceApiUrl,
  huggingFaceFileUrl,
  huggingFaceMigrationRequestSchema,
  modelPrefix,
} from "~/lib/huggingface-migration";
import { r2DeletePrefix, r2PutObject } from "~/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;

type ModelFile = { rfilename?: string; size?: number };

class MigrationFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function responseError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function digestingStream() {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  return {
    stream,
    getDigest: () => hash.digest("hex"),
    getBytes: () => bytes,
  };
}

export async function POST(request: Request) {
  const requestAuth = await resolveRequestAuth(request);
  if (!requestAuth) return responseError("Unauthorized", 401);
  if (!requestAuth.isAdmin) return responseError("Forbidden", 403);

  const token = process.env.HF_MIGRATION_TOKEN;
  if (!token) {
    return responseError("Hugging Face migration is not configured", 503);
  }

  const body = await request.json().catch(() => null);
  const parsed = huggingFaceMigrationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { model, revision } = parsed.data;
  const authorization = { Authorization: `Bearer ${token}` };
  const modelResponse = await fetch(huggingFaceApiUrl(model, revision), {
    headers: authorization,
    cache: "no-store",
  });
  if (!modelResponse.ok) {
    return responseError(
      `Hugging Face model lookup failed with status ${modelResponse.status}`,
      modelResponse.status === 401 || modelResponse.status === 403 ? 403 : 502,
    );
  }

  const modelInfo = (await modelResponse.json()) as { siblings?: ModelFile[] };
  const files: Array<{ name: string; size?: number }> = [];
  for (const file of modelInfo.siblings ?? []) {
    if (file.rfilename && !file.rfilename.startsWith(".git/")) {
      files.push({ name: file.rfilename, size: file.size });
    }
  }

  if (files.length === 0) {
    return responseError("Hugging Face model has no downloadable files", 422);
  }
  if (files.length > MAX_FILES) {
    return responseError(`Model has too many files; maximum is ${MAX_FILES}`, 413);
  }

  const advertisedBytes = files.reduce((total, file) => total + (file.size ?? 0), 0);
  if (advertisedBytes > MAX_TOTAL_BYTES) {
    return responseError("Model exceeds the 10 GiB migration limit", 413);
  }

  const prefix = modelPrefix(model, revision);
  const manifest: Array<{
    name: string;
    key: string;
    bytes: number;
    sha256: string;
  }> = [];
  let totalBytes = 0;

  try {
    for (const file of files) {
      const response = await fetch(huggingFaceFileUrl(model, revision, file.name), {
        headers: authorization,
        cache: "no-store",
      });
      if (!response.ok || !response.body) {
        throw new MigrationFailure(
          `Hugging Face file download failed for ${file.name} with status ${response.status}`,
          response.status === 401 || response.status === 403 ? 403 : 502,
        );
      }

      const contentLength = Number(response.headers.get("content-length") ?? file.size ?? 0);
      if (contentLength > 0 && totalBytes + contentLength > MAX_TOTAL_BYTES) {
        throw new MigrationFailure("Model exceeds the 10 GiB migration limit", 413);
      }

      const key = `${prefix}/${encodeRepositoryFile(file.name)}`;
      const digest = digestingStream();
      await r2PutObject(
        key,
        Readable.fromWeb(response.body as never).pipe(digest.stream),
        response.headers.get("content-type") ?? "application/octet-stream",
        contentLength > 0 ? contentLength : undefined,
      );

      const bytes = digest.getBytes();
      totalBytes += bytes;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new MigrationFailure("Model exceeds the 10 GiB migration limit", 413);
      }
      manifest.push({ name: file.name, key, bytes, sha256: digest.getDigest() });
    }

    const manifestKey = `${prefix}/manifest.json`;
    await r2PutObject(
      manifestKey,
      JSON.stringify(
        {
          model,
          revision,
          source: "https://huggingface.co",
          files: manifest,
          totalBytes,
        },
        null,
        2,
      ),
      "application/json; charset=utf-8",
    );

    return Response.json({
      model,
      revision,
      prefix,
      manifestKey,
      fileCount: manifest.length,
      totalBytes,
    });
  } catch (error) {
    await r2DeletePrefix(prefix).catch(() => undefined);
    if (error instanceof MigrationFailure) {
      return responseError(error.message, error.status);
    }
    return responseError("Hugging Face model migration failed", 502);
  }
}
