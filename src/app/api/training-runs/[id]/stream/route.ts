import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { reconcileStaleTrainingRun } from "~/lib/training-run-observability.server";
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
          .where(
            and(
              eq(trainingRun.id, id),
              eq(trainingRun.userId, session.user.id),
            ),
          )
          .limit(1);

        if (!run) {
          controller.enqueue(event("error", { message: "Run not found" }));
          controller.close();
          return;
        }

        const reconciled = await reconcileStaleTrainingRun(run);

        // Push epoch progress if new epochs have arrived
        if (
          reconciled.currentEpoch !== null &&
          reconciled.currentEpoch > lastEpoch
        ) {
          let history: unknown[] = [];
          if (reconciled.epochHistoryJson) {
            try {
              history = JSON.parse(reconciled.epochHistoryJson);
            } catch {
              /* ignore */
            }
          }
          controller.enqueue(
            event("progress", {
              currentEpoch: reconciled.currentEpoch,
              epochs: reconciled.epochs,
              history,
              status: reconciled.status,
            }),
          );
          lastEpoch = reconciled.currentEpoch;
        }

        // Terminal states — send final event and close
        if (reconciled.status === "complete") {
          controller.enqueue(
            event("complete", {
              finalTrainLoss: reconciled.finalTrainLoss,
              finalValLoss: reconciled.finalValLoss,
              finalValAccuracy: reconciled.finalValAccuracy,
              epochHistoryJson: reconciled.epochHistoryJson,
              completedAt: reconciled.completedAt?.toISOString() ?? null,
              runtimeMs: reconciled.runtimeMs,
              costUsd: reconciled.costUsd,
              costBasis: reconciled.costBasis,
            }),
          );
          controller.close();
          return;
        }

        if (reconciled.status === "error") {
          controller.enqueue(
            event("error", {
              message: reconciled.error ?? "Unknown error",
              runtimeMs: reconciled.runtimeMs,
              costUsd: reconciled.costUsd,
              costBasis: reconciled.costBasis,
            }),
          );
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
