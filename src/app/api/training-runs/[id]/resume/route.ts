import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { dataset, trainingRun } from "../../../../../../data/schema";
import {
  getOwnedTrainingRun,
  reconcileStaleTrainingRun,
  resolveTrainingRunUserId,
  serializeTrainingRun,
} from "~/lib/training-runs.server";
import {
  appendTrainingRunEventSql,
  trainingRunEvent,
} from "~/lib/training-run-events";

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
  const requestedEvent = trainingRunEvent("resume_requested");
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
      workerEventLogJson: appendTrainingRunEventSql(requestedEvent),
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

  const [dispatchStarted] = await db
    .update(trainingRun)
    .set({
      workerEventLogJson: appendTrainingRunEventSql(
        trainingRunEvent("resume_claimed"),
      ),
    })
    .where(
      and(eq(trainingRun.id, claimed.id), eq(trainingRun.status, "running")),
    )
    .returning();
  const dispatchRun = dispatchStarted ?? claimed;
  const debug = body.debug ?? storedDebug(claimed.configJson);

  const modalEndpoint = process.env.MODAL_TRAINING_ENDPOINT;
  let dispatchError: string | null = null;
  await db
    .update(trainingRun)
    .set({
      workerEventLogJson: appendTrainingRunEventSql(
        trainingRunEvent("resume_dispatch_started"),
      ),
    })
    .where(
      and(
        eq(trainingRun.id, dispatchRun.id),
        eq(trainingRun.status, "running"),
      ),
    );
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
      if (!response.ok) {
        dispatchError = `Modal trigger returned HTTP ${response.status}.`;
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
        completedAt: new Date(),
        workerEventLogJson: appendTrainingRunEventSql(
          trainingRunEvent("resume_dispatch_failed", {
            error: dispatchError.slice(0, 500),
          }),
        ),
      })
      .where(
        and(eq(trainingRun.id, claimed.id), eq(trainingRun.status, "running")),
      )
      .returning();
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
    .update(trainingRun)
    .set({
      workerEventLogJson: appendTrainingRunEventSql(
        trainingRunEvent("resume_dispatch_succeeded"),
      ),
    })
    .where(
      and(
        eq(trainingRun.id, dispatchRun.id),
        eq(trainingRun.status, "running"),
      ),
    )
    .returning();

  return Response.json(
    {
      id: dispatchRun.id,
      run: serializeTrainingRun(dispatched ?? dispatchRun),
    },
    { status: 202 },
  );
}
