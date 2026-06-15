/**
 * End-to-end smoke test for the full ContinuousThoughtModel pipeline.
 *
 * Uses random inputs (seeded PRNG for determinism) to verify:
 *   - Output shape: logits.length === nClasses
 *   - Confidence: scalar in [0, 1]
 *   - tick_count: integer in [1, MAX_TICKS]
 *
 * No training — these are untrained weights producing noise, which is fine.
 * The smoke test only cares that the plumbing holds together.
 */
import { describe, expect, test } from "bun:test";
import { ContinuousThoughtModel } from "../continuous-thought-model";
import { MAX_TICKS } from "../tick-loop";

// ── Seeded random helper (LCG, stays local to tests) ─────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function randomEmbeddings(seqLen: number, embedDim: number, seed: number): number[][] {
  const rand = seededRandom(seed);
  return Array.from({ length: seqLen }, () =>
    Array.from({ length: embedDim }, () => rand() * 2 - 1), // uniform [-1, 1]
  );
}

// ── Smoke tests ───────────────────────────────────────────────────────────────

describe("ContinuousThoughtModel — end-to-end smoke test", () => {
  const CONFIG = {
    nNeurons: 4,
    embedDim: 8,
    queryDim: 8,
    valueDim: 4,
    hiddenDim: 16,
    nClasses: 10,
  };

  test("e2e_RandomInput_LogitsLengthEqualsNClasses", () => {
    const model = new ContinuousThoughtModel(CONFIG, 42);
    const { logits } = model.forward(randomEmbeddings(5, CONFIG.embedDim, 1));
    expect(logits).toHaveLength(CONFIG.nClasses);
  });

  test("e2e_RandomInput_LogitsSumToOne", () => {
    const model = new ContinuousThoughtModel(CONFIG, 42);
    const { logits } = model.forward(randomEmbeddings(5, CONFIG.embedDim, 2));
    expect(logits.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0, 10);
  });

  test("e2e_RandomInput_ConfidenceIsScalarInUnitInterval", () => {
    const model = new ContinuousThoughtModel(CONFIG, 42);
    const { confidence } = model.forward(randomEmbeddings(5, CONFIG.embedDim, 3));
    expect(typeof confidence).toBe("number");
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  test("e2e_RandomInput_TickCountIsPositiveIntegerAtMostMaxTicks", () => {
    const model = new ContinuousThoughtModel(CONFIG, 42);
    const { tickCount } = model.forward(randomEmbeddings(5, CONFIG.embedDim, 4));
    expect(Number.isInteger(tickCount)).toBe(true);
    expect(tickCount).toBeGreaterThanOrEqual(1);
    expect(tickCount).toBeLessThanOrEqual(MAX_TICKS);
  });

  test("e2e_MultipleRandomInputs_AllPassSmoke", () => {
    const model = new ContinuousThoughtModel(CONFIG, 99);
    // Run 5 different random inputs through the same model
    for (let i = 0; i < 5; i++) {
      const { logits, confidence, tickCount } = model.forward(
        randomEmbeddings(3, CONFIG.embedDim, i * 17),
      );
      expect(logits).toHaveLength(CONFIG.nClasses);
      expect(logits.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0, 8);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
      expect(tickCount).toBeGreaterThanOrEqual(1);
      expect(tickCount).toBeLessThanOrEqual(MAX_TICKS);
    }
  });
});
