import { trainingRun } from "../../data/schema";

const GPU_RATE_USD_PER_SECOND: Record<string, number> = {
  T4: 0.000164,
  L4: 0.000222,
};
const CPU_RATE_USD_PER_CORE_SECOND = 0.0000131;
const MEMORY_RATE_USD_PER_GIB_SECOND = 0.00000222;

type TrainingRun = typeof trainingRun.$inferSelect;

type ProgressSnapshot = {
  optimizerStep?: unknown;
  maxSteps?: unknown;
  updatedAt?: unknown;
};

export type LiveTrainingMetrics = {
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

function parseProgress(progressJson: string | null): ProgressSnapshot {
  if (!progressJson) return {};
  try {
    const parsed: unknown = JSON.parse(progressJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return parsed as ProgressSnapshot;
  } catch {
    return {};
  }
}

function finiteNonNegativeInteger(value: unknown): number | null {
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

export function deriveLiveTrainingMetrics(
  run: TrainingRun,
  now = new Date(),
): LiveTrainingMetrics {
  const progress = parseProgress(run.progressJson);
  const progressStep =
    finiteNonNegativeInteger(progress.optimizerStep) ?? run.currentStep;
  const progressMaxSteps =
    finiteNonNegativeInteger(progress.maxSteps) ?? run.maxSteps;
  const boundedStep =
    progressStep === null
      ? null
      : Math.min(progressStep, Math.max(0, progressMaxSteps));
  const progressPercent =
    boundedStep === null || progressMaxSteps <= 0
      ? null
      : Number(((boundedStep / progressMaxSteps) * 100).toFixed(2));

  const isRunning = run.status === "running" && run.startedAt !== null;
  const end = run.completedAt ?? now;
  const elapsedRuntimeMs = run.startedAt
    ? (run.runtimeMs ?? Math.max(0, end.getTime() - run.startedAt.getTime()))
    : null;
  const hasFinalCost = run.costUsd !== null;
  const estimatedCostUsd =
    run.costUsd ??
    (elapsedRuntimeMs === null ? null : estimateCostUsd(run, elapsedRuntimeMs));

  let estimatedCompletionAt: string | null = null;
  if (
    isRunning &&
    boundedStep !== null &&
    boundedStep > 0 &&
    elapsedRuntimeMs !== null
  ) {
    const remainingSteps = Math.max(0, progressMaxSteps - boundedStep);
    const millisecondsPerStep = elapsedRuntimeMs / boundedStep;
    const projected = new Date(
      now.getTime() + remainingSteps * millisecondsPerStep,
    );
    estimatedCompletionAt = projected.toISOString();
  }

  const progressUpdatedAt =
    typeof progress.updatedAt === "string" &&
    !Number.isNaN(Date.parse(progress.updatedAt))
      ? new Date(progress.updatedAt).toISOString()
      : null;

  return {
    progressStep: boundedStep,
    progressMaxSteps,
    progressPercent,
    elapsedRuntimeMs,
    estimatedCostUsd,
    estimatedCompletionAt,
    progressUpdatedAt,
    metricsAreLive: isRunning,
    costIsEstimate: !hasFinalCost && estimatedCostUsd !== null,
  };
}
