import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { getRepositoryContext } from "~/lib/repository-context.server";
import {
  getSourceGenerationRun,
  serializeSourceGenerationRun,
} from "~/lib/source-generation-runs.server";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      username: string;
      slug: string;
      source: string;
      runId: string;
    }>;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { username, slug, runId } = await params;
  const context = await getRepositoryContext(username, slug);
  if (!context)
    return Response.json({ error: "Repository not found" }, { status: 404 });
  if (context.owner.id !== session.user.id)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const run = await getSourceGenerationRun({
    id: runId,
    userId: session.user.id,
    repositoryId: context.repo.id,
  });
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  return Response.json({ run: serializeSourceGenerationRun(run) });
}
