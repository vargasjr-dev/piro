import { describe, expect, test } from "bun:test";
import { trainingRun } from "../../../data/schema";
import { deriveTrainingRunMetrics } from "../training-run-metrics";

type TrainingRun = typeof trainingRun.$inferSelect;

const STARTED_AT = new Date("2026-07-25T18:00:00.000Z");
const CHECKPOINT_AT = new Date("2026-07-25T18:05:00.000Z");
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
    resumedFromStep: null,
    queuedAt: STARTED_AT,
    startedAt: STARTED_AT,
    completedAt: null,
    ...overrides,
  };
}

describe("deriveTrainingRunMetrics", () => {
  test("projects completion from the durable checkpoint step", () => {
    const metrics = deriveTrainingRunMetrics(
      makeRun({ checkpointStep: 100, checkpointAt: CHECKPOINT_AT }),
      NOW,
    );

    expect(metrics.progressStep).toBe(100);
    expect(metrics.progressPercent).toBe(40);
    expect(metrics.progressUpdatedAt).toBe(CHECKPOINT_AT.toISOString());
    expect(metrics.estimatedCompletionAt).toBe("2026-07-25T18:25:00.000Z");
  });

  test("reports no progress or ETA before the first checkpoint", () => {
    const metrics = deriveTrainingRunMetrics(makeRun(), NOW);

    expect(metrics.progressStep).toBeNull();
    expect(metrics.progressPercent).toBeNull();
    expect(metrics.progressUpdatedAt).toBeNull();
    expect(metrics.estimatedCompletionAt).toBeNull();
  });

  test("caps checkpoint progress at max steps", () => {
    const metrics = deriveTrainingRunMetrics(
      makeRun({ checkpointStep: 300 }),
      NOW,
    );

    expect(metrics.progressStep).toBe(250);
    expect(metrics.progressPercent).toBe(100);
  });

  test("preserves the persisted final cost over the live estimate", () => {
    const metrics = deriveTrainingRunMetrics(
      makeRun({ status: "complete", runtimeMs: 10_000, costUsd: 1.234567 }),
      NOW,
    );

    expect(metrics.estimatedCostUsd).toBe(1.234567);
    expect(metrics.costIsEstimate).toBe(false);
  });

  test("derives elapsed runtime and estimated cost from the injected clock", () => {
    const metrics = deriveTrainingRunMetrics(makeRun(), NOW);

    expect(metrics.elapsedRuntimeMs).toBe(600_000);
    expect(metrics.estimatedCostUsd).toBe(0.135168);
    expect(metrics.metricsAreLive).toBe(true);
  });

  test("resumed runs pace on segment steps and ignore stale segment runtime", () => {
    // Resumed at 18:00 from step 2955; a stale previous segment left
    // runtimeMs=61923 and costUsd behind. Only 181 steps trained since.
    const metrics = deriveTrainingRunMetrics(
      makeRun({
        maxSteps: 5000,
        checkpointStep: 3136,
        resumedFromStep: 2955,
        runtimeMs: 61_923,
        costUsd: 0.012066,
        costBasis: "modal_standard_estimate",
      }),
      NOW,
    );

    // Elapsed is now - startedAt, NOT the stale runtimeMs; cost is a live
    // estimate, not the stale previous-segment costUsd.
    expect(metrics.elapsedRuntimeMs).toBe(600_000);
    expect(metrics.costIsEstimate).toBe(true);
    expect(metrics.estimatedCostUsd).toBe(0.135168);
    // 600,000ms / 181 segment steps ≈ 3,315ms per step × 1,864 remaining.
    expect(metrics.estimatedCompletionAt).toBe("2026-07-25T19:52:59.005Z");
  });
});
