import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { dataset } from "../../../../../../data/schema";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import { r2Get } from "~/lib/r2";

const HEAD_SIZE = 10;

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
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select({ id: dataset.id, r2Prefix: dataset.r2Prefix })
    .from(dataset)
    .where(and(eq(dataset.id, id), eq(dataset.userId, userId)))
    .limit(1);
  if (!row) return Response.json({ error: "Dataset not found" }, { status: 404 });

  const content = await r2Get(`${row.r2Prefix.replace(/\/$/, "")}/train.jsonl`);
  if (content === null) {
    return Response.json({ error: "Dataset has not been generated yet" }, { status: 404 });
  }

  const entries: unknown[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      return Response.json({ error: "Generated dataset contains invalid JSONL" }, { status: 500 });
    }
    entries.push(entry);
    if (entries.length === HEAD_SIZE) break;
  }

  return Response.json({ datasetId: row.id, entries });
}
