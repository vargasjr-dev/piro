import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../../../../data/db";
import { generationRun } from "../../../../../../../../../data/schema";
import { getRepositoryContext } from "~/lib/repository-context.server";
import { ensureRepositoryDataset } from "~/lib/repository-component-actions";

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; slug: string; source: string }>;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: username, slug, source: encodedSource } = await params;
  const sourceName = decodeURIComponent(encodedSource);
  const context = await getRepositoryContext(username, slug);
  if (!context)
    return Response.json({ error: "Repository not found" }, { status: 404 });
  if (context.owner.id !== session.user.id) {
    return Response.json(
      { error: "Only the repository owner can generate datasets" },
      { status: 403 },
    );
  }
  if (!context.githubRepo) {
    return Response.json(
      { error: "Repository is not linked to GitHub" },
      { status: 404 },
    );
  }

  const prepared = await ensureRepositoryDataset({
    repositoryId: context.repo.id,
    userId: session.user.id,
    githubRepo: context.githubRepo,
    sourceName: sourceName.split("/").at(-1) ?? sourceName,
    sourcePath: sourceName,
    accessToken: context.accessToken,
  });
  if (!prepared)
    return Response.json({ error: "Source not found" }, { status: 404 });

  const { component, datasetId, r2Prefix } = prepared;
  const runId = crypto.randomUUID();
  await db.insert(generationRun).values({
    id: runId,
    userId: session.user.id,
    repositoryId: context.repo.id,
    datasetId,
    sourceName: component.name,
    sourcePath: component.path,
    status: "queued",
  });

  const endpoint = process.env.MODAL_SOURCE_ENDPOINT;
  if (!endpoint) {
    await db
      .update(generationRun)
      .set({
        status: "error",
        error:
          "Dataset generation is not configured yet. Set MODAL_SOURCE_ENDPOINT to enable source execution.",
        completedAt: new Date(),
      })
      .where(eq(generationRun.id, runId));

    return Response.json(
      {
        runId,
        datasetId,
        message:
          "Generation run created, but source execution is not configured yet.",
      },
      { status: 202 },
    );
  }

  waitUntil(
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        datasetId,
        repositoryId: context.repo.id,
        githubOwner: context.githubRepo.owner,
        githubRepository: context.githubRepo.repository,
        sourcePath: component.path,
        entrypoint: component.entrypoint,
        source: component.source,
        r2Prefix,
        callbackUrl: new URL(
          `/api/generation-runs/${runId}`,
          _request.url,
        ).toString(),
        secret: process.env.MODAL_WEBHOOK_SECRET ?? "",
      }),
    })
      .then(async (response) => {
        if (response.ok) return;

        console.error(`[dataset] Modal trigger returned ${response.status}`);
        await db
          .update(generationRun)
          .set({
            status: "error",
            error: `Worker returned HTTP ${response.status}`,
            completedAt: new Date(),
          })
          .where(eq(generationRun.id, runId));
      })
      .catch(async (error) => {
        console.error("[dataset] Modal trigger failed:", error);
        await db
          .update(generationRun)
          .set({
            status: "error",
            error: "Unable to reach the source-generation worker",
            completedAt: new Date(),
          })
          .where(eq(generationRun.id, runId));
      }),
  );

  return Response.json(
    { runId, datasetId, message: "Dataset generation started." },
    { status: 202 },
  );
}
