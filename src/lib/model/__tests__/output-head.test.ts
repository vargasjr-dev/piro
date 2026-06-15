import { describe, expect, test } from "bun:test";
import { OutputHead } from "../output-head";

function identitySync(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

function zeroSync(n: number): number[][] {
  return Array.from({ length: n }, () => new Array(n).fill(0));
}

// ── Output is a valid probability distribution ────────────────────────────────

describe("OutputHead — valid probability distribution", () => {
  test("forward_IdentitySync_OutputLengthEqualsNClasses", () => {
    const head = new OutputHead({ nNeurons: 3, hiddenDim: 8, nClasses: 5 });
    const probs = head.forward(identitySync(3));
    expect(probs).toHaveLength(5);
  });

  test("forward_IdentitySync_ProbabilitiesSumToOne", () => {
    const head = new OutputHead({ nNeurons: 3, hiddenDim: 8, nClasses: 5 });
    const probs = head.forward(identitySync(3));
    const sum = probs.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("forward_ZeroSync_ProbabilitiesSumToOne", () => {
    const head = new OutputHead({ nNeurons: 4, hiddenDim: 6, nClasses: 3 });
    const probs = head.forward(zeroSync(4));
    const sum = probs.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("forward_AllProbabilitiesNonNegative", () => {
    const head = new OutputHead({ nNeurons: 3, hiddenDim: 8, nClasses: 10 });
    const probs = head.forward(identitySync(3));
    for (const p of probs) {
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  test("forward_AllProbabilitiesAtMostOne", () => {
    const head = new OutputHead({ nNeurons: 3, hiddenDim: 8, nClasses: 10 });
    const probs = head.forward(identitySync(3));
    for (const p of probs) {
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  test("forward_TwoClasses_ProbabilitiesSumToOne", () => {
    const head = new OutputHead({ nNeurons: 2, hiddenDim: 4, nClasses: 2 });
    const probs = head.forward(identitySync(2));
    expect(probs).toHaveLength(2);
    expect(probs[0] + probs[1]).toBeCloseTo(1.0, 10);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("OutputHead — determinism", () => {
  test("forward_SameInputTwice_ReturnsSameDistribution", () => {
    const head = new OutputHead({ nNeurons: 3, hiddenDim: 6, nClasses: 4 });
    const sync = identitySync(3);
    expect(head.forward(sync)).toEqual(head.forward(sync));
  });

  test("forward_SameSeedTwoInstances_ReturnsSameDistribution", () => {
    const cfg = { nNeurons: 3, hiddenDim: 6, nClasses: 4 };
    const a = new OutputHead(cfg, 55);
    const b = new OutputHead(cfg, 55);
    expect(a.forward(identitySync(3))).toEqual(b.forward(identitySync(3)));
  });
});

// ── Sensitivity ───────────────────────────────────────────────────────────────

describe("OutputHead — sync matrix sensitivity", () => {
  test("forward_DifferentSyncMatrices_ProduceDifferentDistributions", () => {
    const head = new OutputHead({ nNeurons: 3, hiddenDim: 8, nClasses: 4 });
    const probsIdentity = head.forward(identitySync(3));
    const probsZero = head.forward(zeroSync(3));
    expect(probsIdentity).not.toEqual(probsZero);
  });
});
