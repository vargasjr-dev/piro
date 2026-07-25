import { and, eq } from "drizzle-orm";
import { db } from "../../data/db";
import { trainingRun } from "../../data/schema";

const STALE_RUN_GRACE_MS = 5 * 60 * 1000;
const DEFAULT_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 55 * 60 * 1000;
const GPU_RATE_USD_PER_SECOND: Record<string, number> = {
  T4: 0.000164,
  L4: 0.000222,
};
const CPU_RATE_USD_PER_CORE_SECOND = 0.0000131;
const MEMORY_RATE_USD_PER_GIB_SECOND = 0.00000222;

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

    const [updated] = await db
      .update(trainingRun)
      .set({
        status: "error",
        error: "Training worker was not started before the dispatch deadline.",
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

  const error = pastDeadline
    ? "Training worker exceeded its execution deadline and was reconciled by the API."
    : "Training worker stopped heartbeating and was reconciled by the API.";
  // Reconciliation can happen long after the worker was killed. Cap the
  // recorded runtime and cost at the declared deadline so stale API reads do
  // not bill the run for hours of non-observed execution.
  const end = pastDeadline ? deadline : now;
  const runtimeMs = Math.max(0, end.getTime() - run.startedAt.getTime());
  const [updated] = await db
    .update(trainingRun)
    .set({
      status: "error",
      error,
      completedAt: now,
      runtimeMs,
      costUsd: estimateCostUsd(run, end),
      costBasis: "modal_standard_estimate",
    })
    .where(and(eq(trainingRun.id, run.id), eq(trainingRun.status, "running")))
    .returning();

  return updated ?? run;
}
