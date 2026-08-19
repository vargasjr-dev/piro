import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { dataset, trainingRun } from "../../../../../../data/schema";
import {
  getOwnedTrainingRun,
  reconcileStaleTrainingRun,
  resolveTrainingRunUserId,
  serializeTrainingRun,
} from "~/lib/training-runs.server";
import { trainingRunEvent } from "~/lib/training-run-events";
import { insertTrainingRunEvent } from "~/lib/training-run-events.server";
import { parseModalDispatchResponse } from "~/lib/training-dispatch.server";

const TRAINING_WORKER_LEASE_MS = 50 * 60 * 1000;

interface ResumeBody {
  debug?: boolean;
}

function storedDebug(configJson: string | null): boolean {
  if (!configJson) return false;
  try {
    const config = JSON.parse(configJson) as { debug?: unknown };
    return config.debug === true;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await resolveTrainingRunUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: ResumeBody = {};
  try {
    body = (await request.json()) as ResumeBody;
  } catch {
    // Empty request bodies retain the run's stored debug setting.
  }
  if (body.debug !== undefined && typeof body.debug !== "boolean") {
    return Response.json({ error: "debug must be a boolean" }, { status: 400 });
  }

  const { id } = await params;
  const existing = await getOwnedTrainingRun(id, userId);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const run = await reconcileStaleTrainingRun(existing);
  if (run.status === "running" || run.status === "queued") {
    return Response.json(
      { error: "Training run is already active", id: run.id },
      { status: 409 },
    );
  }
  if (run.status !== "error") {
    return Response.json(
      { error: "Only failed training runs can be resumed", id: run.id },
      { status: 409 },
    );
  }
  if (!run.checkpointR2Key || run.checkpointStep === null) {
    return Response.json(
      { error: "Training run has no checkpoint to resume", id: run.id },
      { status: 409 },
    );
  }
  if (!run.datasetId) {
    return Response.json(
      { error: "Training run has no dataset to resume", id: run.id },
      { status: 409 },
    );
  }

  const [ds] = await db
    .select({ sourcePath: dataset.sourcePath, r2Prefix: dataset.r2Prefix })
    .from(dataset)
    .where(and(eq(dataset.id, run.datasetId), eq(dataset.userId, userId)))
    .limit(1);
  if (!ds)
    return Response.json({ error: "Dataset not found" }, { status: 404 });

  const now = new Date();
  const timeoutAt = new Date(now.getTime() + TRAINING_WORKER_LEASE_MS);
  const [claimed] = await db
    .update(trainingRun)
    .set({
      status: "running",
      error: null,
      startedAt: now,
      heartbeatAt: now,
      timeoutAt,
      workerDiagnosticsJson: null,
      failureDetailsJson: null,
      modalFunctionCallId: null,
      completedAt: null,
    })
    .where(
      and(
        eq(trainingRun.id, run.id),
        eq(trainingRun.userId, userId),
        eq(trainingRun.status, "error"),
        isNotNull(trainingRun.checkpointR2Key),
        isNotNull(trainingRun.checkpointStep),
      ),
    )
    .returning();

  if (!claimed) {
    return Response.json(
      { error: "Training run changed before it could be resumed", id: run.id },
      { status: 409 },
    );
  }

  await insertTrainingRunEvent(
    claimed.id,
    trainingRunEvent("resume_requested"),
  );
  await insertTrainingRunEvent(claimed.id, trainingRunEvent("resume_claimed"));
  const debug = body.debug ?? storedDebug(claimed.configJson);
  await insertTrainingRunEvent(
    claimed.id,
    trainingRunEvent("resume_dispatch_started"),
  );

  const modalEndpoint = process.env.MODAL_TRAINING_ENDPOINT;
  let dispatchError: string | null = null;
  let modalFunctionCallId: string | null = null;
  if (!modalEndpoint) {
    dispatchError = "MODAL_TRAINING_ENDPOINT is not configured.";
  } else {
    try {
      const response = await fetch(modalEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: claimed.id,
          modelName: claimed.modelName,
          architecturePath: claimed.architecturePath,
          sourcePath: ds.sourcePath,
          datasetR2Prefix: ds.r2Prefix,
          maxSteps: claimed.maxSteps,
          seed: 42,
          resume: true,
          debug,
          secret: process.env.MODAL_WEBHOOK_SECRET ?? "",
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const dispatch = await parseModalDispatchResponse(response);
      modalFunctionCallId = dispatch.functionCallId;
      const [tracked] = await db
        .update(trainingRun)
        .set({ modalFunctionCallId })
        .where(
          and(
            eq(trainingRun.id, claimed.id),
            eq(trainingRun.status, "running"),
          ),
        )
        .returning({ id: trainingRun.id });
      if (!tracked) {
        throw new Error(
          "Training run changed before its Modal resume dispatch could be tracked.",
        );
      }
    } catch (error) {
      dispatchError =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "Modal trigger timed out after 30 seconds."
          : `Modal trigger failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (dispatchError) {
    console.error(`[training] resume ${claimed.id}: ${dispatchError}`);
    const [failed] = await db
      .update(trainingRun)
      .set({
        status: "error",
        error: dispatchError,
        modalFunctionCallId,
        completedAt: new Date(),
      })
      .where(
        and(eq(trainingRun.id, claimed.id), eq(trainingRun.status, "running")),
      )
      .returning();
    await insertTrainingRunEvent(
      claimed.id,
      trainingRunEvent("resume_dispatch_failed", {
        error: dispatchError.slice(0, 500),
        functionCallId: modalFunctionCallId,
      }),
    );
    return Response.json(
      {
        error: dispatchError,
        id: claimed.id,
        run: serializeTrainingRun(failed ?? claimed),
      },
      { status: 503 },
    );
  }

  const [dispatched] = await db
    .select()
    .from(trainingRun)
    .where(
      and(eq(trainingRun.id, claimed.id), eq(trainingRun.status, "running")),
    )
    .limit(1);
  await insertTrainingRunEvent(
    claimed.id,
    trainingRunEvent("resume_dispatch_succeeded", {
      functionCallId: modalFunctionCallId,
    }),
  );

  return Response.json(
    {
      id: claimed.id,
      functionCallId: modalFunctionCallId,
      run: serializeTrainingRun(dispatched ?? claimed),
    },
    { status: 202 },
  );
}
