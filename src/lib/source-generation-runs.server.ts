import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../data/db";
import { dataset, generationRun } from "../../data/schema";
import { SOURCE_GENERATION_RUN_PAGE_SIZE } from "~/lib/source-generation-runs";

export { SOURCE_GENERATION_RUN_PAGE_SIZE } from "~/lib/source-generation-runs";

export type SourceGenerationRun = {
  id: string;
  sourceName: string;
  sourcePath: string;
  status: string;
  costUsd: number | null;
  error: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  dataset: {
    id: string;
    name: string;
    sampleCount: number | null;
    generatedAt: Date | null;
  } | null;
};

export async function listSourceGenerationRuns({
  repositoryId,
  sourcePath,
  page,
}: {
  repositoryId: string;
  sourcePath: string;
  page: number;
}) {
  const safePage = Math.max(1, page);
  const where = and(
    eq(generationRun.repositoryId, repositoryId),
    eq(generationRun.sourcePath, sourcePath),
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(generationRun)
    .where(where);
  const pageCount = Math.max(
    1,
    Math.ceil(total / SOURCE_GENERATION_RUN_PAGE_SIZE),
  );
  const currentPage = Math.min(safePage, pageCount);
  const runs = await db
    .select({
      id: generationRun.id,
      sourceName: generationRun.sourceName,
      sourcePath: generationRun.sourcePath,
      status: generationRun.status,
      costUsd: generationRun.costUsd,
      error: generationRun.error,
      queuedAt: generationRun.queuedAt,
      startedAt: generationRun.startedAt,
      completedAt: generationRun.completedAt,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        sampleCount: dataset.sampleCount,
        generatedAt: dataset.generatedAt,
      },
    })
    .from(generationRun)
    .leftJoin(dataset, eq(generationRun.datasetId, dataset.id))
    .where(where)
    .orderBy(desc(generationRun.queuedAt))
    .limit(SOURCE_GENERATION_RUN_PAGE_SIZE)
    .offset((currentPage - 1) * SOURCE_GENERATION_RUN_PAGE_SIZE);

  return { runs, total, page: currentPage, pageCount };
}

export async function getSourceGenerationRun({
  id,
  userId,
  repositoryId,
}: {
  id: string;
  userId: string;
  repositoryId: string;
}): Promise<SourceGenerationRun | null> {
  const [run] = await db
    .select({
      id: generationRun.id,
      sourceName: generationRun.sourceName,
      sourcePath: generationRun.sourcePath,
      status: generationRun.status,
      costUsd: generationRun.costUsd,
      error: generationRun.error,
      queuedAt: generationRun.queuedAt,
      startedAt: generationRun.startedAt,
      completedAt: generationRun.completedAt,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        sampleCount: dataset.sampleCount,
        generatedAt: dataset.generatedAt,
      },
    })
    .from(generationRun)
    .leftJoin(dataset, eq(generationRun.datasetId, dataset.id))
    .where(
      and(
        eq(generationRun.id, id),
        eq(generationRun.userId, userId),
        eq(generationRun.repositoryId, repositoryId),
      ),
    )
    .limit(1);

  return run ?? null;
}

export function serializeSourceGenerationRun(run: SourceGenerationRun) {
  return {
    ...run,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    dataset: run.dataset
      ? {
          ...run.dataset,
          generatedAt: run.dataset.generatedAt?.toISOString() ?? null,
        }
      : null,
  };
}
