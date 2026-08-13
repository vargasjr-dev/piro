import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { deriveTrainingRunMetrics } from "~/lib/training-run-metrics";
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
      let lastProgressSignature = "";

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
        const liveMetrics = deriveTrainingRunMetrics(reconciled);

        let history: unknown[] = [];
        if (reconciled.stepHistoryJson) {
          try {
            history = JSON.parse(reconciled.stepHistoryJson);
          } catch {
            /* ignore */
          }
        }
        const progressPayload = JSON.stringify({
          maxSteps: reconciled.maxSteps,
          checkpointStep: reconciled.checkpointStep,
          checkpointAt: reconciled.checkpointAt?.toISOString() ?? null,
          history,
          ...liveMetrics,
          workerDiagnosticsJson: reconciled.workerDiagnosticsJson,
          failureDetailsJson: reconciled.failureDetailsJson,
          status: reconciled.status,
        });
        if (progressPayload !== lastProgressSignature) {
          controller.enqueue(event("progress", JSON.parse(progressPayload)));
          lastProgressSignature = progressPayload;
        }

        // Terminal states — send final event and close
        if (reconciled.status === "complete") {
          controller.enqueue(
            event("complete", {
              finalTrainLoss: reconciled.finalTrainLoss,
              finalValLoss: reconciled.finalValLoss,
              finalValAccuracy: reconciled.finalValAccuracy,
              stepHistoryJson: reconciled.stepHistoryJson,
              completedAt: reconciled.completedAt?.toISOString() ?? null,
              runtimeMs: reconciled.runtimeMs,
              costUsd: reconciled.costUsd,
              costBasis: reconciled.costBasis,
              workerDiagnosticsJson: reconciled.workerDiagnosticsJson,
              failureDetailsJson: reconciled.failureDetailsJson,
              ...liveMetrics,
            }),
          );
          controller.close();
          return;
        }

        if (
          reconciled.status === "error" ||
          reconciled.status === "cancelled"
        ) {
          controller.enqueue(
            event(reconciled.status, {
              message: reconciled.error ?? "Training run cancelled",
              runtimeMs: reconciled.runtimeMs,
              costUsd: reconciled.costUsd,
              costBasis: reconciled.costBasis,
              ...liveMetrics,
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
