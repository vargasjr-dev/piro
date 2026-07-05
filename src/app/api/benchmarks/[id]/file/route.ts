import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../../data/db";
import { benchmark } from "../../../../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { r2Get, r2PutText } from "~/lib/r2";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

/**
 * GET /api/benchmarks/[id]/file?path=script.py
 *
 * Returns text content of a file under the benchmark's R2 prefix.
 * Only script.py is supported. Returns up to 100 KB.
 *
 * PUT /api/benchmarks/[id]/file
 *
 * Writes (creates or overwrites) script.py under the benchmark's R2 prefix.
 * Body: { path: string, content: string }
 * Accepts session cookie or Bearer API key.
 */

const ALLOWED_PATHS = new Set(["script.py"]);

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const filePath = new URL(request.url).searchParams.get("path");
  if (!filePath) return Response.json({ error: "path query param required" }, { status: 400 });
  if (!ALLOWED_PATHS.has(filePath))
    return Response.json({ error: "Unknown file" }, { status: 400 });

  const [bm] = await db
    .select({ scriptR2Key: benchmark.scriptR2Key })
    .from(benchmark)
    .where(and(eq(benchmark.id, id), eq(benchmark.userId, userId)))
    .limit(1);

  if (!bm) return Response.json({ error: "Not found" }, { status: 404 });
  if (!bm.scriptR2Key)
    return Response.json({ error: "No script uploaded yet" }, { status: 404 });

  const { content, truncated, size } = await r2Get(bm.scriptR2Key);

  return Response.json({
    path: filePath,
    content,
    truncated,
    size,
  });
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

  const filePath = body.path ?? "script.py";
  if (!ALLOWED_PATHS.has(filePath))
    return Response.json({ error: "Unknown file" }, { status: 400 });

  const content = body.content;
  if (typeof content !== "string")
    return Response.json({ error: "content must be a string" }, { status: 400 });

  const [bm] = await db
    .select({ scriptR2Key: benchmark.scriptR2Key, r2Prefix: benchmark.r2Prefix })
    .from(benchmark)
    .where(and(eq(benchmark.id, id), eq(benchmark.userId, userId)))
    .limit(1);

  if (!bm) return Response.json({ error: "Not found" }, { status: 404 });

  const r2Key = bm.scriptR2Key ?? `${userId}/${bm.r2Prefix ?? `benchmarks/${id}/`}script.py`;

  await r2PutText(r2Key, content, PATH_CONTENT_TYPES[filePath] ?? "text/plain");

  // Ensure scriptR2Key is set on the row (in case it was null)
  if (!bm.scriptR2Key) {
    await db
      .update(benchmark)
      .set({ scriptR2Key: r2Key, updatedAt: new Date() })
      .where(eq(benchmark.id, id));
  }

  return Response.json({ ok: true, path: filePath, size: content.length });
}
