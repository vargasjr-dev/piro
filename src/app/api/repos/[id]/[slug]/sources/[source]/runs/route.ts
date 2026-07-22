import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { getRepositoryContext } from "~/lib/repository-context.server";
import {
  listSourceGenerationRuns,
  serializeSourceGenerationRun,
} from "~/lib/source-generation-runs.server";
import { getRepositoryComponent } from "~/lib/github-repository";

export async function GET(
  request: Request,
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
  if (context.owner.id !== session.user.id)
    return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!context.githubRepo)
    return Response.json(
      { error: "Repository is not linked to GitHub" },
      { status: 404 },
    );

  const component = await getRepositoryComponent(
    context.githubRepo.owner,
    context.githubRepo.repository,
    "sources",
    sourceName,
    context.accessToken,
    AbortSignal.timeout(10_000),
  ).catch(() => null);
  if (!component)
    return Response.json({ error: "Source not found" }, { status: 404 });

  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const result = await listSourceGenerationRuns({
    repositoryId: context.repo.id,
    sourcePath: component.path,
    page: Number.isFinite(page) ? page : 1,
  });

  return Response.json({
    ...result,
    runs: result.runs.map(serializeSourceGenerationRun),
  });
}
