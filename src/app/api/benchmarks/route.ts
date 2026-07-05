import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { benchmark, dataSource } from "../../../../data/schema";
import { eq, desc } from "drizzle-orm";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

/**
 * GET /api/benchmarks
 *
 * Lists all benchmarks for the authenticated user, joined with their
 * data source name. Accepts session cookie or Bearer API key.
 *
 * POST /api/benchmarks
 *
 * Creates a new benchmark. Body:
 *   { id, name, dataSourceId?, description?, configJson? }
 * Auto-sets r2Prefix and scriptR2Key so push/pull work immediately.
 */

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const benchmarks = await db
    .select({
      id: benchmark.id,
      name: benchmark.name,
      slug: benchmark.slug,
      description: benchmark.description,
      dataSourceId: benchmark.dataSourceId,
      dataSourceName: dataSource.name,
      r2Prefix: benchmark.r2Prefix,
      scriptR2Key: benchmark.scriptR2Key,
      configJson: benchmark.configJson,
      createdAt: benchmark.createdAt,
      updatedAt: benchmark.updatedAt,
    })
    .from(benchmark)
    .leftJoin(dataSource, eq(benchmark.dataSourceId, dataSource.id))
    .where(eq(benchmark.userId, userId))
    .orderBy(desc(benchmark.createdAt));

  return Response.json({
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description ?? null,
      dataSourceId: b.dataSourceId ?? null,
      dataSourceName: b.dataSourceName ?? null,
      hasScript: b.scriptR2Key !== null,
      configJson: b.configJson ?? null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id as string | undefined;
  const name = body.name as string | undefined;
  if (!id || !name) {
    return Response.json({ error: "id and name are required" }, { status: 400 });
  }

  const dataSourceId = (body.dataSourceId as string | undefined) ?? null;
  const description = (body.description as string | undefined) ?? null;
  const configJson = (body.configJson as string | undefined) ?? null;

  const r2Prefix = `benchmarks/${id}/`;
  const scriptR2Key = `${userId}/${r2Prefix}script.py`;

  try {
    await db.insert(benchmark).values({
      id,
      userId,
      name,
      slug: id, // slug = id for URL-friendly routing
      description,
      dataSourceId,
      r2Prefix,
      scriptR2Key,
      configJson,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    if (msg.includes("unique")) {
      return Response.json({ error: `Benchmark '${id}' already exists` }, { status: 409 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ id, ok: true });
}
