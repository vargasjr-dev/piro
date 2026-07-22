import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../../data/db";
import { generationRun } from "../../../../../../../../data/schema";
import { getOwnedRepository } from "~/lib/repository-api.server";
import { ensureRepositoryDataset } from "~/lib/repository-component-actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; source: string }> }) {
  const { id, source: encodedSource } = await params;
  const repo = await getOwnedRepository(request, id);
  if (!repo) return Response.json({ error: "Unauthorized or repository not found" }, { status: 404 });
  if (!repo.githubOwner || !repo.githubRepository) return Response.json({ error: "Repository is not linked to GitHub" }, { status: 404 });

  const sourcePath = decodeURIComponent(encodedSource);
  const sourceName = sourcePath.split("/").at(-1) ?? sourcePath;
  const prepared = await ensureRepositoryDataset({
    repositoryId: repo.id,
    userId: repo.userId,
    githubRepo: { owner: repo.githubOwner, repository: repo.githubRepository },
    sourceName,
    sourcePath,
    accessToken: repo.accessToken,
  });
  if (!prepared) return Response.json({ error: "Source not found" }, { status: 404 });

  const runId = crypto.randomUUID();
  await db.insert(generationRun).values({
    id: runId,
    userId: repo.userId,
    repositoryId: repo.id,
    datasetId: prepared.datasetId,
    sourceName: prepared.component.name,
    sourcePath: prepared.component.path,
    status: "queued",
  });

  const endpoint = process.env.MODAL_SOURCE_ENDPOINT;
  if (!endpoint) {
    await db.update(generationRun).set({
      status: "error",
      error: "Dataset generation is not configured yet. Set MODAL_SOURCE_ENDPOINT to enable source execution.",
      completedAt: new Date(),
    }).where(eq(generationRun.id, runId));
    return Response.json({ runId, datasetId: prepared.datasetId, message: "Generation run created, but source execution is not configured yet." }, { status: 202 });
  }

  waitUntil(fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      datasetId: prepared.datasetId,
      repositoryId: repo.id,
      githubOwner: repo.githubOwner,
      githubRepository: repo.githubRepository,
      sourcePath: prepared.component.path,
      entrypoint: prepared.component.entrypoint,
      source: prepared.component.source,
      r2Prefix: prepared.r2Prefix,
      callbackUrl: new URL(`/api/generation-runs/${runId}`, request.url).toString(),
      secret: process.env.MODAL_WEBHOOK_SECRET ?? "",
    }),
  }).then(async (response) => {
    if (response.ok) return;
    await db.update(generationRun).set({ status: "error", error: `Worker returned HTTP ${response.status}`, completedAt: new Date() }).where(eq(generationRun.id, runId));
  }).catch(async () => {
    await db.update(generationRun).set({ status: "error", error: "Unable to reach the source-generation worker", completedAt: new Date() }).where(eq(generationRun.id, runId));
  }));

  return Response.json({ runId, datasetId: prepared.datasetId, message: "Dataset generation started." }, { status: 202 });
}
