import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { getRepositoryContext } from "~/lib/repository-context.server";
import {
  getSourceGenerationRun,
  serializeSourceGenerationRun,
} from "~/lib/source-generation-runs.server";

export const runtime = "edge";
const POLL_MS = 2000;

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      slug: string;
      source: string;
      runId: string;
    }>;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id: username, slug, runId } = await params;
  const context = await getRepositoryContext(username, slug);
  if (!context || context.owner.id !== session.user.id)
    return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const event = (name: string, data: unknown) =>
    encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        const run = await getSourceGenerationRun({
          id: runId,
          userId: session.user.id,
          repositoryId: context.repo.id,
        });
        if (!run) {
          controller.enqueue(event("error", { message: "Run not found" }));
          controller.close();
          return;
        }

        const serialized = serializeSourceGenerationRun(run);
        controller.enqueue(event("state", serialized));

        if (run.status === "complete") {
          controller.close();
          return;
        }
        if (run.status === "error") {
          controller.close();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
