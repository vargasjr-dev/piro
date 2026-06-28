import { describe, expect, test } from "bun:test";
import { pearsonCorrelation, correlationMatrix } from "../correlation";

// ── Perfect in-phase ───────────────────────────────────────────────────────────

describe("pearsonCorrelation — in-phase neurons", () => {
  test("identical sequences return 1", () => {
    const a = [0, 1, 2, 3];
    const b = [0, 1, 2, 3];
    expect(pearsonCorrelation(a, b)).toBe(1);
  });

  test("positive linear transform preserves perfect correlation", () => {
    const a = [1, 2, 3, 4, 5];
    const b = a.map((x) => 3 * x + 7);
    expect(pearsonCorrelation(a, b)).toBe(1);
  });
});

// ── Perfect out-of-phase ──────────────────────────────────────────────────────

describe("pearsonCorrelation — out-of-phase neurons", () => {
  test("reversed sequence returns -1", () => {
    const a = [0, 1, 2, 3];
    const b = [3, 2, 1, 0];
    expect(pearsonCorrelation(a, b)).toBe(-1);
  });

  test("negative linear transform inverts correlation", () => {
    const a = [1, 2, 3, 4, 5];
    const b = a.map((x) => -2 * x + 10);
    expect(pearsonCorrelation(a, b)).toBe(-1);
  });
});

// ── Independent (orthogonal) neurons ─────────────────────────────────────────

describe("pearsonCorrelation — independent neurons", () => {
  test("orthogonal sequences return 0", () => {
    // Σ(ai - ā)(bi - b̄) = 0 by construction
    const a = [1, -1, 1, -1];
    const b = [1, 1, -1, -1];
    expect(pearsonCorrelation(a, b)).toBe(0);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("pearsonCorrelation — edge cases", () => {
  test("constant sequence returns 0 (undefined correlation)", () => {
    const a = [1, 2, 3, 4];
    const b = [5, 5, 5, 5];
    expect(pearsonCorrelation(a, b)).toBe(0);
  });

  test("length mismatch throws", () => {
    expect(() => pearsonCorrelation([1, 2, 3], [1, 2])).toThrow("same length");
  });

  test("single element throws", () => {
    expect(() => pearsonCorrelation([1], [1])).toThrow("at least 2");
  });

  test("two elements works (minimum valid input)", () => {
    expect(pearsonCorrelation([0, 1], [0, 1])).toBe(1);
    expect(pearsonCorrelation([0, 1], [1, 0])).toBe(-1);
  });
});

// ── correlationMatrix ─────────────────────────────────────────────────────────

describe("correlationMatrix", () => {
  test("identity matrix for in-phase neurons", () => {
    const acts = [
      [0, 1, 2, 3],
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ];
    const m = correlationMatrix(acts);
    expect(m[0][0]).toBe(1);
    expect(m[0][1]).toBe(1);
    expect(m[1][0]).toBe(1);
    expect(m[2][2]).toBe(1);
  });

  test("matrix is symmetric", () => {
    const acts = [
      [1, 2, 3, 4],
      [4, 3, 2, 1],
      [1, -1, 1, -1],
    ];
    const m = correlationMatrix(acts);
    expect(m[0][1]).toBe(m[1][0]);
    expect(m[0][2]).toBe(m[2][0]);
    expect(m[1][2]).toBe(m[2][1]);
  });
});
