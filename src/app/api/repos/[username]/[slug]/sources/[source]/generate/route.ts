import { waitUntil } from "@vercel/functions";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { getRepositoryContext } from "~/lib/repository-context.server";
import { ensureRepositoryDataset } from "~/lib/repository-component-actions";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ username: string; slug: string; source: string }>;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { username, slug, source: encodedSource } = await params;
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

  const endpoint = process.env.MODAL_SOURCE_ENDPOINT;
  if (!endpoint) {
    return Response.json(
      {
        error:
          "Dataset generation is not configured yet. Set MODAL_SOURCE_ENDPOINT to enable source execution.",
      },
      { status: 503 },
    );
  }

  const prepared = await ensureRepositoryDataset({
    repositoryId: context.repo.id,
    userId: session.user.id,
    githubRepo: context.githubRepo,
    sourceName,
    accessToken: context.accessToken,
  });
  if (!prepared)
    return Response.json({ error: "Source not found" }, { status: 404 });

  const { component, datasetId, r2Prefix } = prepared;

  waitUntil(
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetId,
        repositoryId: context.repo.id,
        githubOwner: context.githubRepo.owner,
        githubRepository: context.githubRepo.repository,
        sourcePath: component.path,
        entrypoint: component.entrypoint,
        r2Prefix,
        secret: process.env.MODAL_WEBHOOK_SECRET ?? "",
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          console.error(`[dataset] Modal trigger returned ${response.status}`);
        }
      })
      .catch((error) => {
        console.error("[dataset] Modal trigger failed:", error);
      }),
  );

  return Response.json(
    { datasetId, message: "Dataset generation started." },
    { status: 202 },
  );
}
