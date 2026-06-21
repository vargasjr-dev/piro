/**
 * GET /api/classes/[id]/file?path=model.py
 *
 * Returns text content of a file under the class's R2 module prefix.
 * Only files known to live there (model.py) are allowed.
 * Returns up to 100 KB — truncates with truncated: true flag.
 *
 * PUT /api/classes/[id]/file
 *
 * Writes (creates or overwrites) a file under the class's R2 module prefix.
 * Body: { path: string, content: string }
 * Accepts session cookie or Bearer API key.
 */

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { modelClass } from "../../../../../../data/schema";
import { r2Get, r2PutText } from "~/lib/r2";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

const ALLOWED_PATHS = new Set(["model.py"]);

const PATH_CONTENT_TYPES: Record<string, string> = {
  "model.py": "text/x-python; charset=utf-8",
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

  const [cls] = await db
    .select({ moduleR2Key: modelClass.moduleR2Key })
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, userId)))
    .limit(1);

  if (!cls) return Response.json({ error: "Not found" }, { status: 404 });
  if (!cls.moduleR2Key)
    return Response.json({ error: "No module uploaded yet" }, { status: 404 });

  const raw = await r2Get(`${cls.moduleR2Key}/${filePath}`);
  if (raw === null) return Response.json({ error: "File not found in bucket" }, { status: 404 });

  const MAX = 100_000;
  const truncated = raw.length > MAX;
  return Response.json({ content: truncated ? raw.slice(0, MAX) : raw, truncated, size: raw.length });
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
  if (!ALLOWED_PATHS.has(filePath))
    return Response.json({ error: "Unknown file" }, { status: 400 });
  if (typeof content !== "string")
    return Response.json({ error: "content must be a string" }, { status: 400 });

  const [cls] = await db
    .select({ moduleR2Key: modelClass.moduleR2Key })
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, userId)))
    .limit(1);

  if (!cls) return Response.json({ error: "Not found" }, { status: 404 });
  if (!cls.moduleR2Key)
    return Response.json({ error: "No module uploaded yet" }, { status: 404 });

  const contentType = PATH_CONTENT_TYPES[filePath] ?? "text/plain; charset=utf-8";
  await r2PutText(`${cls.moduleR2Key}/${filePath}`, content, contentType);

  return Response.json({ ok: true, path: filePath, size: content.length });
}
