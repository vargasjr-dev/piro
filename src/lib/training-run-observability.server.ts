import { and, eq } from "drizzle-orm";
import { db } from "../../data/db";
import { trainingRun } from "../../data/schema";
import { parseTrainingRunEvents } from "./training-run-events";
import { getRecentTrainingRunEvents } from "./training-run-events.server";

const STALE_RUN_GRACE_MS = 5 * 60 * 1000;
const DEFAULT_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 55 * 60 * 1000;
const GPU_RATE_USD_PER_SECOND: Record<string, number> = {
  T4: 0.000164,
  L4: 0.000222,
};
const CPU_RATE_USD_PER_CORE_SECOND = 0.0000131;
const MEMORY_RATE_USD_PER_GIB_SECOND = 0.00000222;

function parseWorkerDiagnostics(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

function failureDetailsJson(
  kind: string,
  reason: string,
  run: typeof trainingRun.$inferSelect,
  observedAt: Date,
  workerEvents = parseTrainingRunEvents(run.workerEventLogJson),
) {
  const lastWorkerEvent = workerEvents.at(-1) ?? null;
  return JSON.stringify({
    kind,
    reason,
    observedAt: observedAt.toISOString(),
    lastHeartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    workerDiagnostics: parseWorkerDiagnostics(run.workerDiagnosticsJson),
    workerEvents,
    lastWorkerEvent,
  });
}

function estimateCostUsd(
  run: typeof trainingRun.$inferSelect,
  end: Date,
): number | null {
  if (!run.startedAt) return null;
  const durationMs = Math.max(0, end.getTime() - run.startedAt.getTime());
  const gpuRate = run.gpuType ? (GPU_RATE_USD_PER_SECOND[run.gpuType] ?? 0) : 0;
  const cpuRate = CPU_RATE_USD_PER_CORE_SECOND * (run.cpuCores ?? 0.125);
  const memoryRate =
    MEMORY_RATE_USD_PER_GIB_SECOND * ((run.memoryMb ?? 128) / 1024);
  return Number(
    ((durationMs / 1000) * (gpuRate + cpuRate + memoryRate)).toFixed(6),
  );
}

export async function reconcileStaleTrainingRun(
  run: typeof trainingRun.$inferSelect,
) {
  const now = new Date();

  if (run.status === "queued") {
    const queueDeadline =
      run.timeoutAt ??
      new Date(run.queuedAt.getTime() + DEFAULT_QUEUE_TIMEOUT_MS);
    if (now <= queueDeadline) return run;

    const workerEvents = await getRecentTrainingRunEvents(run.id);
    const [updated] = await db
      .update(trainingRun)
      .set({
        status: "error",
        error: "Training worker was not started before the dispatch deadline.",
        failureDetailsJson: failureDetailsJson(
          "queue_timeout",
          "Training worker was not started before the dispatch deadline.",
          run,
          now,
          workerEvents.length > 0 ? workerEvents : undefined,
        ),
        completedAt: now,
        heartbeatAt: now,
      })
      .where(and(eq(trainingRun.id, run.id), eq(trainingRun.status, "queued")))
      .returning();
    return updated ?? run;
  }

  if (run.status !== "running" || !run.startedAt) return run;

  const deadline =
    run.timeoutAt ?? new Date(run.startedAt.getTime() + DEFAULT_TIMEOUT_MS);
  const heartbeat = run.heartbeatAt ?? run.startedAt;
  const pastDeadline = now > deadline;
  const heartbeatExpired =
    now.getTime() - heartbeat.getTime() > STALE_RUN_GRACE_MS;

  if (!pastDeadline && !heartbeatExpired) return run;

  const workerDiagnostics = parseWorkerDiagnostics(run.workerDiagnosticsJson);
  const phase = workerDiagnostics?.phase;
  const step = workerDiagnostics?.step;
  const workerEvents = await getRecentTrainingRunEvents(run.id);
  const legacyEvents = workerEvents.length
    ? workerEvents
    : parseTrainingRunEvents(run.workerEventLogJson);
  const lastWorkerEvent = legacyEvents.at(-1);
  const eventContext =
    lastWorkerEvent && typeof lastWorkerEvent === "object"
      ? ` Last worker event=${String((lastWorkerEvent as Record<string, unknown>).event ?? "unknown")} at ${String((lastWorkerEvent as Record<string, unknown>).observedAt ?? "unknown")}.`
      : "";
  const context =
    phase || step !== undefined
      ? ` Last known phase=${String(phase ?? "unknown")}, step=${String(step ?? "unknown")}.${eventContext}`
      : eventContext;
  const error = pastDeadline
    ? `Training worker exceeded its execution deadline and was reconciled by the API.${context}`
    : `Training worker stopped heartbeating and was reconciled by the API.${context}`;
  const end = pastDeadline ? deadline : now;
  const runtimeMs = Math.max(0, end.getTime() - run.startedAt.getTime());
  const [updated] = await db
    .update(trainingRun)
    .set({
      status: "error",
      error,
      failureDetailsJson: failureDetailsJson(
        pastDeadline ? "deadline_reconciliation" : "heartbeat_reconciliation",
        error,
        run,
        now,
        legacyEvents,
      ),
      completedAt: now,
      runtimeMs,
      costUsd: estimateCostUsd(run, end),
      costBasis: "modal_standard_estimate",
    })
    .where(and(eq(trainingRun.id, run.id), eq(trainingRun.status, "running")))
    .returning();

  return updated ?? run;
}
