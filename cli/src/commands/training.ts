import { piroFetch, resolveConfig } from "../client.js";
import { errorMessage } from "../response-schemas.js";

const TRAINING_DEADLINE_SECONDS = 3000;
const GPU_RATE_USD_PER_SECOND: Record<string, number> = {
  T4: 0.000164,
  L4: 0.000222,
};
const CPU_RATE_USD_PER_CORE_SECOND = 0.0000131;
const MEMORY_RATE_USD_PER_GIB_SECOND = 0.00000222;
const DEFAULT_GPU = "T4";
const DEFAULT_CPU_CORES = 1;
const DEFAULT_MEMORY_MB = 4096;
const DEFAULT_SECONDS_PER_STEP = 1;

type EstimateOptions = {
  maxSteps?: string;
  gpu?: string;
  secondsPerStep?: string;
};

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
  process.exit(1);
}

function positiveNumber(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Error: --${label} must be a positive number`);
    process.exit(1);
  }
  return parsed;
}

export function estimateTraining(
  maxSteps: number,
  secondsPerStep: number,
  gpu = DEFAULT_GPU,
) {
  const runtimeSeconds = maxSteps * secondsPerStep;
  const billedSeconds = Math.min(runtimeSeconds, TRAINING_DEADLINE_SECONDS);
  const gpuRate =
    GPU_RATE_USD_PER_SECOND[gpu] ?? GPU_RATE_USD_PER_SECOND[DEFAULT_GPU];
  const resourceRate =
    gpuRate +
    CPU_RATE_USD_PER_CORE_SECOND * DEFAULT_CPU_CORES +
    MEMORY_RATE_USD_PER_GIB_SECOND * (DEFAULT_MEMORY_MB / 1024);
  return {
    maxSteps,
    secondsPerStep,
    gpu,
    estimatedRuntimeSeconds: runtimeSeconds,
    estimatedRuntimeMinutes: runtimeSeconds / 60,
    deadlineSeconds: TRAINING_DEADLINE_SECONDS,
    estimatedBilledSeconds: billedSeconds,
    estimatedCostUsd: Number((billedSeconds * resourceRate).toFixed(6)),
    costBasis: "modal_standard_estimate",
    note: "Estimate only; excludes provider startup variance and any architecture-specific step-time changes.",
  };
}

export async function trainingList(): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/training-runs");
  if (!response.ok)
    fail(response.status, response.body, "training run listing failed");
  console.log(JSON.stringify(response.body, null, 2));
}

export async function trainingGet(id: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/training-runs/${encodeURIComponent(id)}`,
  );
  if (!response.ok)
    fail(response.status, response.body, "training run lookup failed");
  console.log(JSON.stringify(response.body, null, 2));
}

export async function trainingEstimate(opts: EstimateOptions): Promise<void> {
  const maxSteps = positiveNumber(opts.maxSteps, 5000, "max-steps");
  if (!Number.isInteger(maxSteps)) {
    console.error("Error: --max-steps must be a positive integer");
    process.exit(1);
  }
  const secondsPerStep = positiveNumber(
    opts.secondsPerStep,
    DEFAULT_SECONDS_PER_STEP,
    "seconds-per-step",
  );
  console.log(
    JSON.stringify(
      estimateTraining(maxSteps, secondsPerStep, opts.gpu),
      null,
      2,
    ),
  );
}
