import { trainingRun } from "../../data/schema";

const GPU_RATE_USD_PER_SECOND: Record<string, number> = {
  T4: 0.000164,
  L4: 0.000222,
};
const CPU_RATE_USD_PER_CORE_SECOND = 0.0000131;
const MEMORY_RATE_USD_PER_GIB_SECOND = 0.00000222;

type TrainingRun = typeof trainingRun.$inferSelect;

export type TrainingRunMetrics = {
  progressStep: number | null;
  progressMaxSteps: number;
  progressPercent: number | null;
  elapsedRuntimeMs: number | null;
  estimatedCostUsd: number | null;
  estimatedCompletionAt: string | null;
  progressUpdatedAt: string | null;
  metricsAreLive: boolean;
  costIsEstimate: boolean;
};

function finiteNonNegativeInteger(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function estimateCostUsd(run: TrainingRun, runtimeMs: number): number | null {
  if (!run.startedAt) return null;
  const gpuRate = run.gpuType ? (GPU_RATE_USD_PER_SECOND[run.gpuType] ?? 0) : 0;
  const cpuRate = CPU_RATE_USD_PER_CORE_SECOND * (run.cpuCores ?? 0.125);
  const memoryRate =
    MEMORY_RATE_USD_PER_GIB_SECOND * ((run.memoryMb ?? 128) / 1024);
  return Number(
    (
      (Math.max(0, runtimeMs) / 1000) *
      (gpuRate + cpuRate + memoryRate)
    ).toFixed(6),
  );
}

export function deriveTrainingRunMetrics(
  run: TrainingRun,
  now = new Date(),
): TrainingRunMetrics {
  const progressStep = finiteNonNegativeInteger(run.checkpointStep);
  const progressMaxSteps = Math.max(0, run.maxSteps);
  const boundedStep =
    progressStep === null ? null : Math.min(progressStep, progressMaxSteps);
  const progressPercent =
    boundedStep === null || progressMaxSteps <= 0
      ? null
      : Number(((boundedStep / progressMaxSteps) * 100).toFixed(2));

  const isRunning = run.status === "running" && run.startedAt !== null;
  const end = run.completedAt ?? now;
  // While a run is active, ignore runtimeMs — it only describes the latest
  // worker segment and is stale until the segment ends.
  const elapsedRuntimeMs = run.startedAt
    ? isRunning
      ? Math.max(0, end.getTime() - run.startedAt.getTime())
      : (run.runtimeMs ?? Math.max(0, end.getTime() - run.startedAt.getTime()))
    : null;
  const hasFinalCost = run.costUsd !== null && !isRunning;
  // While running, costUsd describes a previous segment — estimate live cost.
  const estimatedCostUsd = isRunning
    ? (elapsedRuntimeMs === null ? null : estimateCostUsd(run, elapsedRuntimeMs))
    : (run.costUsd ??
      (elapsedRuntimeMs === null ? null : estimateCostUsd(run, elapsedRuntimeMs)));

  let estimatedCompletionAt: string | null = null;
  // Pace must come from steps trained in the current segment: resumed runs
  // start at a non-zero checkpoint step, and dividing by the absolute step
  // undercounts per-step time by the resume offset.
  const segmentStartStep = isRunning ? (run.resumedFromStep ?? 0) : 0;
  const stepsThisSegment =
    boundedStep === null ? 0 : Math.max(0, boundedStep - segmentStartStep);
  if (isRunning && stepsThisSegment > 0 && elapsedRuntimeMs !== null) {
    const remainingSteps = Math.max(0, progressMaxSteps - boundedStep);
    const millisecondsPerStep = elapsedRuntimeMs / stepsThisSegment;
    const projected = new Date(
      now.getTime() + remainingSteps * millisecondsPerStep,
    );
    estimatedCompletionAt = projected.toISOString();
  }

  return {
    progressStep: boundedStep,
    progressMaxSteps,
    progressPercent,
    elapsedRuntimeMs,
    estimatedCostUsd,
    estimatedCompletionAt,
    progressUpdatedAt: run.checkpointAt?.toISOString() ?? null,
    metricsAreLive: isRunning,
    costIsEstimate: !hasFinalCost && estimatedCostUsd !== null,
  };
}
