import { getOwnedRepository } from "~/lib/repository-api.server";
import { getRepositoryComponent } from "~/lib/github-repository";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; source: string }> }) {
  const { id, source: encodedSource } = await params;
  const repo = await getOwnedRepository(request, id);
  if (!repo) return Response.json({ error: "Unauthorized or repository not found" }, { status: 404 });
  if (!repo.githubOwner || !repo.githubRepository) return Response.json({ error: "Repository is not linked to GitHub" }, { status: 404 });
  const sourcePath = decodeURIComponent(encodedSource);
  const component = await getRepositoryComponent(
    repo.githubOwner,
    repo.githubRepository,
    "sources",
    sourcePath.split("/").at(-1) ?? sourcePath,
    repo.accessToken,
    AbortSignal.timeout(10_000),
    sourcePath,
  );
  if (!component) return Response.json({ error: "Source not found" }, { status: 404 });
  return Response.json({ source: component });
}
