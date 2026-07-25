import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { repository, dataset, trainingRun } from "../../../../../data/schema";
import { eq, and, desc } from "drizzle-orm";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import { parseGitHubRepositoryRef } from "~/lib/github-repository";
import { reconcileStaleTrainingRun } from "~/lib/training-runs.server";

/**
 * GET /api/repos/[id]
 *
 * Returns a repository with its datasets and training runs.
 * Architectures, benchmarks, and sources are defined in the explicitly
 * connected GitHub repo (convention: /architectures/<name>/main.py,
 * /benchmarks/<name>/main.py, /sources/<name>/main.py) — not stored as DB rows.
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body.githubRepository;
  if (typeof input !== "string") {
    return Response.json(
      { error: "githubRepository is required" },
      { status: 400 },
    );
  }

  const githubRepo = parseGitHubRepositoryRef(input);
  if (!githubRepo) {
    return Response.json(
      { error: "githubRepository must be a GitHub URL or owner/repository" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(repository)
    .set({
      githubOwner: githubRepo.owner,
      githubRepository: githubRepo.repository,
      updatedAt: new Date(),
    })
    .where(and(eq(repository.id, id), eq(repository.userId, userId)))
    .returning({ id: repository.id });

  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ id: updated.id, ok: true });
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
    db
      .select()
      .from(dataset)
      .where(eq(dataset.repositoryId, id))
      .orderBy(desc(dataset.createdAt)),
    db
      .select()
      .from(trainingRun)
      .where(eq(trainingRun.repositoryId, id))
      .orderBy(desc(trainingRun.queuedAt)),
  ]);

  const reconciledRuns = await Promise.all(runs.map(reconcileStaleTrainingRun));

  return Response.json({
    repo: {
      id: repo.id,
      name: repo.name,
      slug: repo.slug,
      description: repo.description ?? null,
      githubOwner: repo.githubOwner,
      githubRepository: repo.githubRepository,
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
    trainingRuns: reconciledRuns.map((r) => ({
      id: r.id,
      modelName: r.modelName,
      architecturePath: r.architecturePath,
      datasetId: r.datasetId,
      status: r.status,
      maxSteps: r.maxSteps,
      finalValAccuracy: r.finalValAccuracy,
      currentStep: r.currentStep,
      progressJson: r.progressJson,
      heartbeatAt: r.heartbeatAt?.toISOString() ?? null,
      timeoutAt: r.timeoutAt?.toISOString() ?? null,
      runtimeMs: r.runtimeMs,
      costUsd: r.costUsd,
      costBasis: r.costBasis,
      resourceType: r.resourceType,
      gpuType: r.gpuType,
      checkpointStep: r.checkpointStep,
      checkpointAt: r.checkpointAt?.toISOString() ?? null,
      queuedAt: r.queuedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
}
