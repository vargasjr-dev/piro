import { describe, expect, test } from "bun:test";
import { ConfidenceHead } from "../confidence-head";

function identitySync(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

function zeroSync(n: number): number[][] {
  return Array.from({ length: n }, () => new Array(n).fill(0));
}

// ── Output range ──────────────────────────────────────────────────────────────

describe("ConfidenceHead — output range", () => {
  test("forward_IdentitySync_OutputInUnitInterval", () => {
    const head = new ConfidenceHead({ nNeurons: 4, hiddenDim: 8 });
    const score = head.forward(identitySync(4));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("forward_ZeroSync_OutputInUnitInterval", () => {
    const head = new ConfidenceHead({ nNeurons: 4, hiddenDim: 8 });
    const score = head.forward(zeroSync(4));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("forward_AllOnesSync_OutputInUnitInterval", () => {
    const head = new ConfidenceHead({ nNeurons: 3, hiddenDim: 4 });
    const allOnes = Array.from({ length: 3 }, () => [1, 1, 1]);
    const score = head.forward(allOnes);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("forward_AllNegativeOneSync_OutputInUnitInterval", () => {
    const head = new ConfidenceHead({ nNeurons: 3, hiddenDim: 4 });
    const allNeg = Array.from({ length: 3 }, () => [-1, -1, -1]);
    const score = head.forward(allNeg);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("ConfidenceHead — determinism", () => {
  test("forward_SameInputTwice_ReturnsSameScore", () => {
    const head = new ConfidenceHead({ nNeurons: 3, hiddenDim: 6 });
    const sync = identitySync(3);
    expect(head.forward(sync)).toBe(head.forward(sync));
  });

  test("forward_SameSeedTwoInstances_ReturnsSameScore", () => {
    const cfg = { nNeurons: 3, hiddenDim: 6 };
    const a = new ConfidenceHead(cfg, 77);
    const b = new ConfidenceHead(cfg, 77);
    expect(a.forward(identitySync(3))).toBe(b.forward(identitySync(3)));
  });

  test("forward_DifferentSeeds_ReturnDifferentScores", () => {
    const cfg = { nNeurons: 3, hiddenDim: 6 };
    const a = new ConfidenceHead(cfg, 1);
    const b = new ConfidenceHead(cfg, 2);
    // Different weights should (almost certainly) give different outputs
    expect(a.forward(identitySync(3))).not.toBe(b.forward(identitySync(3)));
  });
});

// ── Sensitivity ───────────────────────────────────────────────────────────────

describe("ConfidenceHead — sync matrix sensitivity", () => {
  test("forward_DifferentSyncMatrices_ProduceDifferentScores", () => {
    const head = new ConfidenceHead({ nNeurons: 3, hiddenDim: 8 });
    const scoreIdentity = head.forward(identitySync(3));
    const scoreZero = head.forward(zeroSync(3));
    expect(scoreIdentity).not.toBe(scoreZero);
  });
});
