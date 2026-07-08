import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { repository, dataset, trainingRun } from "../../../../../data/schema";
import { eq, and, desc } from "drizzle-orm";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

/**
 * GET /api/repos/[id]
 *
 * Returns a repository with its datasets and training runs.
 * Architectures and benchmarks are defined in the connected GitHub repo
 * (convention: /architectures/<name>/main.py, /benchmarks/<name>/main.py)
 * — not stored as DB rows.
 *
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

  const [datasets, runs] = await Promise.all([
    db.select().from(dataset).where(eq(dataset.repositoryId, id)).orderBy(desc(dataset.createdAt)),
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
    datasets: datasets.map((d) => ({
      id: d.id,
      name: d.name,
      sourcePath: d.sourcePath,
      sampleCount: d.sampleCount,
      generatedAt: d.generatedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    trainingRuns: runs.map((r) => ({
      id: r.id,
      modelName: r.modelName,
      architecturePath: r.architecturePath,
      datasetId: r.datasetId,
      status: r.status,
      epochs: r.epochs,
      finalValAccuracy: r.finalValAccuracy,
      queuedAt: r.queuedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
}
