import { describe, expect, test } from "bun:test";
import { pearsonCorrelation } from "../correlation";

// ── Perfect in-phase ───────────────────────────────────────────────────────────

describe("pearsonCorrelation — in-phase neurons", () => {
  test("pearsonCorrelation_IdenticalSequence_Returns1", () => {
    const a = [0, 1, 2, 3];
    const b = [0, 1, 2, 3];
    expect(pearsonCorrelation(a, b)).toBe(1);
  });

  test("pearsonCorrelation_LinearlyScaledSequence_Returns1", () => {
    // b = 3a + 7 — any positive linear transform preserves correlation
    const a = [1, 2, 3, 4, 5];
    const b = a.map((x) => 3 * x + 7);
    expect(pearsonCorrelation(a, b)).toBe(1);
  });
});

// ── Perfect out-of-phase ──────────────────────────────────────────────────────

describe("pearsonCorrelation — out-of-phase neurons", () => {
  test("pearsonCorrelation_ReversedSequence_ReturnsMinus1", () => {
    const a = [0, 1, 2, 3];
    const b = [3, 2, 1, 0];
    expect(pearsonCorrelation(a, b)).toBe(-1);
  });

  test("pearsonCorrelation_NegativelyScaledSequence_ReturnsMinus1", () => {
    // b = -2a + 10 — any negative linear transform inverts correlation
    const a = [1, 2, 3, 4, 5];
    const b = a.map((x) => -2 * x + 10);
    expect(pearsonCorrelation(a, b)).toBe(-1);
  });
});

// ── Independent (orthogonal) neurons ─────────────────────────────────────────

describe("pearsonCorrelation — independent neurons", () => {
  test("pearsonCorrelation_OrthogonalSequences_Returns0", () => {
    // Σ(ai - ā)(bi - b̄) = 0 by construction: both means are 0,
    // dot product = 1·1 + (-1)·1 + 1·(-1) + (-1)·(-1) = 0
    const a = [1, -1, 1, -1];
    const b = [1, 1, -1, -1];
    expect(pearsonCorrelation(a, b)).toBe(0);
  });

  test("pearsonCorrelation_ZeroMeanAntiSymmetric_Returns0", () => {
    // Another exact-zero case: a = [1, 2, 3, 4], b = [1, -1, 1, -1]
    // ā = 2.5, b̄ = 0
    // num = (1-2.5)(1) + (2-2.5)(-1) + (3-2.5)(1) + (4-2.5)(-1)
    //     = -1.5 + 0.5 + 0.5 - 1.5 = -2 ... not zero
    // Use the well-known orthogonal pair instead:
    // a = [1, -1, -1, 1], b = [1, 1, -1, -1]
    // num = 1·1 + (-1)·1 + (-1)·(-1) + 1·(-1) = 1 - 1 + 1 - 1 = 0
    const a = [1, -1, -1, 1];
    const b = [1, 1, -1, -1];
    expect(pearsonCorrelation(a, b)).toBe(0);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("pearsonCorrelation — edge cases", () => {
  test("pearsonCorrelation_ConstantSequence_Returns0", () => {
    // Constant b has zero variance — correlation undefined, returns 0
    const a = [1, 2, 3, 4];
    const b = [5, 5, 5, 5];
    expect(pearsonCorrelation(a, b)).toBe(0);
  });

  test("pearsonCorrelation_LengthMismatch_Throws", () => {
    expect(() => pearsonCorrelation([1, 2, 3], [1, 2])).toThrow(
      "same length",
    );
  });

  test("pearsonCorrelation_SingleElement_Throws", () => {
    expect(() => pearsonCorrelation([1], [1])).toThrow("at least 2");
  });

  test("pearsonCorrelation_TwoElements_Works", () => {
    // Minimum valid input: two opposite elements
    expect(pearsonCorrelation([0, 1], [0, 1])).toBe(1);
    expect(pearsonCorrelation([0, 1], [1, 0])).toBe(-1);
  });
});
