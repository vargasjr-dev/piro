/**
 * GET /api/classes/[id]/file?path=model.py
 *
 * Returns text content of a file under the class's R2 module prefix.
 * Only files known to live there (model.py, manifest.json) are allowed.
 * Returns up to 100 KB — truncates with truncated: true flag.
 */

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { modelClass } from "../../../../../../data/schema";
import { r2Get } from "~/lib/r2";

const ALLOWED_PATHS = new Set(["model.py", "manifest.json"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const filePath = new URL(request.url).searchParams.get("path");
  if (!filePath) return Response.json({ error: "path query param required" }, { status: 400 });
  if (!ALLOWED_PATHS.has(filePath))
    return Response.json({ error: "Unknown file" }, { status: 400 });

  const [cls] = await db
    .select({ moduleR2Key: modelClass.moduleR2Key })
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, session.user.id)))
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
