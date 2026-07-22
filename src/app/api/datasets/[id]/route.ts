import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { dataset, generationRun, repository } from "../../../../../data/schema";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db
    .select({ dataset, repository: { id: repository.id, name: repository.name, slug: repository.slug } })
    .from(dataset)
    .innerJoin(repository, eq(repository.id, dataset.repositoryId))
    .where(and(eq(dataset.id, id), eq(dataset.userId, userId)))
    .limit(1);
  if (!row) return Response.json({ error: "Dataset not found" }, { status: 404 });

  const runs = await db
    .select()
    .from(generationRun)
    .where(and(eq(generationRun.datasetId, id), eq(generationRun.userId, userId)))
    .orderBy(desc(generationRun.queuedAt));

  return Response.json({
    dataset: {
      id: row.dataset.id,
      name: row.dataset.name,
      sourcePath: row.dataset.sourcePath,
      r2Prefix: row.dataset.r2Prefix,
      sampleCount: row.dataset.sampleCount,
      generatedAt: row.dataset.generatedAt?.toISOString() ?? null,
      createdAt: row.dataset.createdAt.toISOString(),
      updatedAt: row.dataset.updatedAt.toISOString(),
    },
    repository: row.repository,
    runs: runs.map((run) => ({
      id: run.id,
      sourceName: run.sourceName,
      sourcePath: run.sourcePath,
      status: run.status,
      costUsd: run.costUsd,
      error: run.error,
      queuedAt: run.queuedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
    })),
  });
}
