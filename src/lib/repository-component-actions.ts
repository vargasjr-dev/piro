import { db } from "../../data/db";
import { dataset } from "../../data/schema";
import { eq, and } from "drizzle-orm";
import { getRepositoryComponent } from "~/lib/github-repository";
import type { GitHubRepositoryRef } from "~/lib/github-repository";

export async function ensureRepositoryDataset({
  repositoryId,
  userId,
  githubRepo,
  sourceName,
  accessToken,
}: {
  repositoryId: string;
  userId: string;
  githubRepo: GitHubRepositoryRef;
  sourceName: string;
  accessToken?: string | null;
}) {
  const component = await getRepositoryComponent(
    githubRepo.owner,
    githubRepo.repository,
    "sources",
    sourceName,
    accessToken,
    AbortSignal.timeout(10_000),
  ).catch(() => null);
  if (!component) return null;

  const r2Prefix = `repos/${repositoryId}/datasets/${sourceName}/`;
  const [existing] = await db
    .select({ id: dataset.id })
    .from(dataset)
    .where(
      and(
        eq(dataset.repositoryId, repositoryId),
        eq(dataset.sourcePath, component.path),
      ),
    )
    .limit(1);

  const datasetId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db
      .update(dataset)
      .set({ updatedAt: new Date() })
      .where(eq(dataset.id, datasetId));
  } else {
    await db.insert(dataset).values({
      id: datasetId,
      userId,
      repositoryId,
      name: sourceName,
      sourcePath: component.path,
      r2Prefix,
    });
  }

  return { component, datasetId, r2Prefix };
}
