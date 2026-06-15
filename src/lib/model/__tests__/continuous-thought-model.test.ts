import { describe, expect, test } from "bun:test";
import { ContinuousThoughtModel } from "../continuous-thought-model";
import { MAX_TICKS } from "../tick-loop";

// ── Fixture ───────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  nNeurons: 3,
  embedDim: 4,
  queryDim: 4,
  valueDim: 3,
  hiddenDim: 8,
  nClasses: 5,
};

const EMBEDDINGS = [[1, 0, 0, 0], [0, 1, 0, 0]];

// ── Output shape & types ──────────────────────────────────────────────────────

describe("ContinuousThoughtModel — output shape", () => {
  test("forward_ReturnsLogitsOfLengthNClasses", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const { logits } = model.forward(EMBEDDINGS);
    expect(logits).toHaveLength(BASE_CONFIG.nClasses);
  });

  test("forward_LogitsSumToOne", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const { logits } = model.forward(EMBEDDINGS);
    expect(logits.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0, 10);
  });

  test("forward_AllLogitsNonNegative", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const { logits } = model.forward(EMBEDDINGS);
    for (const p of logits) expect(p).toBeGreaterThanOrEqual(0);
  });

  test("forward_ConfidenceInUnitInterval", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const { confidence } = model.forward(EMBEDDINGS);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  test("forward_TickCountPositive", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const { tickCount } = model.forward(EMBEDDINGS);
    expect(tickCount).toBeGreaterThan(0);
  });

  test("forward_LogIncludesTickCount", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const { tickCount, log } = model.forward(EMBEDDINGS);
    expect(log.ticksRun).toBe(tickCount);
  });
});

// ── Single flat embedding ─────────────────────────────────────────────────────

describe("ContinuousThoughtModel — single flat embedding", () => {
  test("forward_FlatEmbedding_ReturnsValidLogits", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const { logits } = model.forward([1, 0, 0, 0]); // flat vector
    expect(logits).toHaveLength(BASE_CONFIG.nClasses);
    expect(logits.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0, 10);
  });
});

// ── Tick loop integration ─────────────────────────────────────────────────────

describe("ContinuousThoughtModel — tick loop integration", () => {
  test("forward_UnreachableThreshold_TickCountEqualsMaxTicks", () => {
    const model = new ContinuousThoughtModel({
      ...BASE_CONFIG,
      maxTicks: 5,
      confidenceThreshold: 1.0, // unreachable
    });
    const { tickCount, log } = model.forward(EMBEDDINGS);
    expect(tickCount).toBe(5);
    expect(log.converged).toBe(false);
  });

  test("forward_ZeroThreshold_ConvergesOnFirstTick", () => {
    const model = new ContinuousThoughtModel({
      ...BASE_CONFIG,
      confidenceThreshold: 0,
    });
    const { tickCount, log } = model.forward(EMBEDDINGS);
    expect(tickCount).toBe(1);
    expect(log.converged).toBe(true);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("ContinuousThoughtModel — determinism", () => {
  test("forward_SameInputTwice_ReturnsSameResult", () => {
    const model = new ContinuousThoughtModel(BASE_CONFIG);
    const a = model.forward(EMBEDDINGS);
    const b = model.forward(EMBEDDINGS);
    expect(a.logits).toEqual(b.logits);
    expect(a.confidence).toBe(b.confidence);
    expect(a.tickCount).toBe(b.tickCount);
  });

  test("forward_SameSeedTwoInstances_ReturnsSameLogits", () => {
    const a = new ContinuousThoughtModel(BASE_CONFIG, 7);
    const b = new ContinuousThoughtModel(BASE_CONFIG, 7);
    expect(a.forward(EMBEDDINGS).logits).toEqual(b.forward(EMBEDDINGS).logits);
  });

  test("forward_DifferentSeeds_ReturnDifferentLogits", () => {
    const a = new ContinuousThoughtModel(BASE_CONFIG, 1);
    const b = new ContinuousThoughtModel(BASE_CONFIG, 2);
    expect(a.forward(EMBEDDINGS).logits).not.toEqual(b.forward(EMBEDDINGS).logits);
  });
});
