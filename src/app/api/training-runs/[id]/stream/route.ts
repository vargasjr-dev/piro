import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { trainingRun } from "../../../../../../data/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "edge";

// Poll interval while running (ms)
const POLL_MS = 2000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  function event(name: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      let lastEpoch = -1;

      while (true) {
        const [run] = await db
          .select()
          .from(trainingRun)
          .where(and(eq(trainingRun.id, id), eq(trainingRun.userId, session.user.id)))
          .limit(1);

        if (!run) {
          controller.enqueue(event("error", { message: "Run not found" }));
          controller.close();
          return;
        }

        // Push epoch progress if new epochs have arrived
        if (run.currentEpoch !== null && run.currentEpoch > lastEpoch) {
          let history: unknown[] = [];
          if (run.epochHistoryJson) {
            try { history = JSON.parse(run.epochHistoryJson); } catch { /* ignore */ }
          }
          controller.enqueue(event("progress", {
            currentEpoch: run.currentEpoch,
            epochs: run.epochs,
            history,
            status: run.status,
          }));
          lastEpoch = run.currentEpoch;
        }

        // Terminal states — send final event and close
        if (run.status === "complete") {
          controller.enqueue(event("complete", {
            finalTrainLoss: run.finalTrainLoss,
            finalValLoss: run.finalValLoss,
            finalValAccuracy: run.finalValAccuracy,
            epochHistoryJson: run.epochHistoryJson,
            completedAt: run.completedAt?.toISOString() ?? null,
          }));
          controller.close();
          return;
        }

        if (run.status === "error") {
          controller.enqueue(event("error", { message: run.error ?? "Unknown error" }));
          controller.close();
          return;
        }

        // Still running — wait before next poll
        await new Promise((r) => setTimeout(r, POLL_MS));
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
