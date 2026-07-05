import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { repository, dataSource, benchmark, modelClass, trainingRun } from "../../../../../data/schema";
import { eq, and, desc } from "drizzle-orm";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

/**
 * GET /api/repos/[id]
 *
 * Returns a repository with its components: data sources, architectures
 * (model classes), benchmarks, and training runs.
 * Accepts session cookie or Bearer API key.
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [repo] = await db
    .select()
    .from(repository)
    .where(and(eq(repository.id, id), eq(repository.userId, userId)))
    .limit(1);

  if (!repo) return Response.json({ error: "Not found" }, { status: 404 });

  // Fetch components that belong to this repo
  const [sources, benchmarks, classes, runs] = await Promise.all([
    db.select().from(dataSource).where(eq(dataSource.repositoryId, id)).orderBy(desc(dataSource.createdAt)),
    db.select().from(benchmark).where(eq(benchmark.repositoryId, id)).orderBy(desc(benchmark.createdAt)),
    db.select().from(modelClass).where(eq(modelClass.repositoryId, id)).orderBy(desc(modelClass.createdAt)),
    db.select().from(trainingRun).where(eq(trainingRun.repositoryId, id)).orderBy(desc(trainingRun.queuedAt)),
  ]);

  return Response.json({
    repo: {
      id: repo.id,
      name: repo.name,
      slug: repo.slug,
      description: repo.description ?? null,
      createdAt: repo.createdAt.toISOString(),
      updatedAt: repo.updatedAt.toISOString(),
    },
    dataSources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      sampleCount: s.sampleCount,
      generatedAt: s.generatedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    architectures: classes.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      parameterCount: c.parameterCount,
      hasModule: c.moduleR2Key !== null,
      createdAt: c.createdAt.toISOString(),
    })),
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      dataSourceId: b.dataSourceId,
      hasScript: b.scriptR2Key !== null,
      createdAt: b.createdAt.toISOString(),
    })),
    trainingRuns: runs.map((r) => ({
      id: r.id,
      modelName: r.modelName,
      modelTemplate: r.modelTemplate,
      dataSource: r.dataSource,
      status: r.status,
      epochs: r.epochs,
      finalValAccuracy: r.finalValAccuracy,
      queuedAt: r.queuedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
}
