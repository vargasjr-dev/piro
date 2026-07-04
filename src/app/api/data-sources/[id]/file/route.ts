import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { dataSource } from "../../../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { r2Get, r2PutText } from "~/lib/r2";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

/**
 * GET /api/data-sources/[id]/file?path=script.py
 *                or ?path=data/train.jsonl
 *
 * Reads a file from the source's R2 prefix and returns its text content.
 * The `path` param is relative to the source's r2Prefix, with `script.py`
 * being a special case (its key is stored directly on the row).
 * Returns up to 50 KB — truncates large files with a truncated: true flag.
 *
 * PUT /api/data-sources/[id]/file
 *
 * Writes (creates or overwrites) a file under the source's R2 prefix.
 * Body: { path: string, content: string }
 * Only `script.py` is allowed for write — generated data files are
 * produced by generate-source.mjs and uploaded via a separate path.
 * Accepts session cookie or Bearer API key.
 */

const WRITABLE_PATHS = new Set(["script.py"]);

const PATH_CONTENT_TYPES: Record<string, string> = {
  "script.py": "text/x-python; charset=utf-8",
};

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

function resolveKey(
  source: { scriptR2Key: string | null; r2Prefix: string | null },
  userId: string,
  filePath: string,
): string | null {
  if (filePath === "script.py") return source.scriptR2Key;
  if (!source.r2Prefix) return null;
  return `${userId}/${source.r2Prefix}${filePath}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");
  if (!filePath) return Response.json({ error: "path query param required" }, { status: 400 });

  const [source] = await db
    .select()
    .from(dataSource)
    .where(and(eq(dataSource.id, id), eq(dataSource.userId, userId)))
    .limit(1);

  if (!source) return Response.json({ error: "Not found" }, { status: 404 });

  const key = resolveKey(source, userId, filePath);
  if (!key) return Response.json({ error: "Source has no R2 data yet" }, { status: 404 });

  const raw = await r2Get(key);
  if (raw === null) return Response.json({ error: "File not found in bucket" }, { status: 404 });

  const MAX = 50_000;
  const truncated = raw.length > MAX;
  const content = truncated ? raw.slice(0, MAX) : raw;

  return Response.json({ content, truncated, size: raw.length });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { path?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { path: filePath, content } = body;
  if (!filePath) return Response.json({ error: "path is required" }, { status: 400 });
  if (!WRITABLE_PATHS.has(filePath))
    return Response.json({ error: "Unknown file" }, { status: 400 });
  if (typeof content !== "string")
    return Response.json({ error: "content must be a string" }, { status: 400 });

  const [source] = await db
    .select()
    .from(dataSource)
    .where(and(eq(dataSource.id, id), eq(dataSource.userId, userId)))
    .limit(1);

  if (!source) return Response.json({ error: "Not found" }, { status: 404 });

  const key = resolveKey(source, userId, filePath);
  if (!key) return Response.json({ error: "Source has no scriptR2Key" }, { status: 404 });

  const contentType = PATH_CONTENT_TYPES[filePath] ?? "text/plain; charset=utf-8";
  await r2PutText(key, content, contentType);

  return Response.json({ ok: true, path: filePath, size: content.length });
}