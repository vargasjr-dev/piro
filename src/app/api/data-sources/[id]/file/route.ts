import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { dataSource } from "../../../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { r2Get } from "~/lib/r2";

/**
 * GET /api/data-sources/[id]/file?path=data/train.jsonl
 *
 * Reads a file from the source's R2 prefix and returns its text content.
 * The `path` param is relative to the source's r2Prefix (e.g. "data/train.jsonl").
 * Returns up to 50 KB — truncates large files with a truncated: true flag.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");
  if (!filePath) return Response.json({ error: "path query param required" }, { status: 400 });

  const [source] = await db
    .select()
    .from(dataSource)
    .where(and(eq(dataSource.id, id), eq(dataSource.userId, session.user.id)))
    .limit(1);

  if (!source) return Response.json({ error: "Not found" }, { status: 404 });

  // Build the full R2 key
  const isScript = filePath === "script.py";
  const key = isScript
    ? source.scriptR2Key
    : source.r2Prefix
    ? `${session.user.id}/${source.r2Prefix}${filePath}`
    : null;

  if (!key) return Response.json({ error: "Source has no R2 data yet" }, { status: 404 });

  const raw = await r2Get(key);
  if (raw === null) return Response.json({ error: "File not found in bucket" }, { status: 404 });

  const MAX = 50_000;
  const truncated = raw.length > MAX;
  const content = truncated ? raw.slice(0, MAX) : raw;

  return Response.json({ content, truncated, size: raw.length });
}
