import { describe, expect, test } from "bun:test";
import { trainingRun } from "../../../data/schema";
import { deriveLiveTrainingMetrics } from "../training-run-metrics";

type TrainingRun = typeof trainingRun.$inferSelect;

const STARTED_AT = new Date("2026-07-25T18:00:00.000Z");
const NOW = new Date("2026-07-25T18:10:00.000Z");

function makeRun(overrides: Partial<TrainingRun> = {}): TrainingRun {
  return {
    id: "run-1",
    userId: "user-1",
    modelName: "test-model",
    architecturePath: "architectures/test",
    datasetId: null,
    status: "running",
    maxSteps: 250,
    configJson: null,
    finalTrainLoss: null,
    finalValLoss: null,
    finalValAccuracy: null,
    stepHistoryJson: null,
    currentStep: 0,
    progressJson: null,
    error: null,
    heartbeatAt: null,
    timeoutAt: null,
    runtimeMs: null,
    costUsd: null,
    costBasis: null,
    resourceType: "gpu",
    gpuType: "T4",
    cpuCores: 4,
    memoryMb: 4096,
    checkpointR2Key: null,
    checkpointStep: null,
    checkpointAt: null,
    queuedAt: STARTED_AT,
    startedAt: STARTED_AT,
    completedAt: null,
    ...overrides,
  };
}

describe("deriveLiveTrainingMetrics", () => {
  test("should project completion from optimizer progress when the run is active", () => {
    const metrics = deriveLiveTrainingMetrics(
      makeRun({
        progressJson: JSON.stringify({
          optimizerStep: 100,
          updatedAt: NOW.toISOString(),
        }),
      }),
      NOW,
    );

    expect(metrics.progressPercent).toBe(40);
    expect(metrics.estimatedCompletionAt).toBe("2026-07-25T18:25:00.000Z");
  });

  test("should report no ETA before the first optimizer step", () => {
    const metrics = deriveLiveTrainingMetrics(makeRun(), NOW);

    expect(metrics.estimatedCompletionAt).toBeNull();
  });

  test("should fall back to durable progress when progress JSON is malformed", () => {
    const metrics = deriveLiveTrainingMetrics(
      makeRun({ currentStep: 50, progressJson: "not-json" }),
      NOW,
    );

    expect(metrics.progressStep).toBe(50);
  });

  test("should cap progress percentage when the live step exceeds max steps", () => {
    const metrics = deriveLiveTrainingMetrics(
      makeRun({ progressJson: JSON.stringify({ optimizerStep: 300 }) }),
      NOW,
    );

    expect(metrics.progressPercent).toBe(100);
  });

  test("should preserve the persisted final cost over the live estimate", () => {
    const metrics = deriveLiveTrainingMetrics(
      makeRun({ status: "complete", runtimeMs: 10_000, costUsd: 1.234567 }),
      NOW,
    );

    expect(metrics.estimatedCostUsd).toBe(1.234567);
    expect(metrics.costIsEstimate).toBe(false);
  });

  test("should derive elapsed runtime and estimated cost from the injected clock", () => {
    const metrics = deriveLiveTrainingMetrics(makeRun(), NOW);

    expect(metrics.elapsedRuntimeMs).toBe(600_000);
    expect(metrics.estimatedCostUsd).toBe(0.135168);
    expect(metrics.metricsAreLive).toBe(true);
  });
});
