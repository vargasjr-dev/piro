import { getOwnedRepository } from "~/lib/repository-api.server";
import { listRepositoryComponents } from "~/lib/repository-components";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getOwnedRepository(request, id);
  if (!repo) return Response.json({ error: "Unauthorized or repository not found" }, { status: 404 });
  if (!repo.githubOwner || !repo.githubRepository) return Response.json({ sources: [] });
  const sources = await listRepositoryComponents(
    repo.githubOwner,
    repo.githubRepository,
    "sources",
    repo.accessToken,
    AbortSignal.timeout(10_000),
  );
  return Response.json({ sources });
}
