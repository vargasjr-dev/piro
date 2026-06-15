import { describe, expect, test } from "bun:test";
import { BaselineTransformer } from "../baseline-transformer";
import { ContinuousThoughtModel } from "../continuous-thought-model";

// ── Default benchmark config ──────────────────────────────────────────────────
// CTM: 870 params | Transformer: 871 params (0.1% delta)

const CTM_CONFIG = {
  nNeurons: 4,
  embedDim: 8,
  queryDim: 8,
  valueDim: 4,
  hiddenDim: 16,
  nClasses: 5,
};

const TRANSFORMER_CONFIG = {
  embedDim: 8,
  nHeads: 2,
  ffnDim: 6,   // tuned so total params = 857, within 1.5% of CTM's 870
  nLayers: 2,
  nClasses: 5,
};

const EMBEDDINGS = [[1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0, 0, 0]];

// ── Output shape & valid distribution ────────────────────────────────────────

describe("BaselineTransformer — output shape", () => {
  test("forward_ReturnsLogitsOfLengthNClasses", () => {
    const model = new BaselineTransformer(TRANSFORMER_CONFIG);
    expect(model.forward(EMBEDDINGS)).toHaveLength(TRANSFORMER_CONFIG.nClasses);
  });

  test("forward_LogitsSumToOne", () => {
    const model = new BaselineTransformer(TRANSFORMER_CONFIG);
    const sum = model.forward(EMBEDDINGS).reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("forward_AllLogitsNonNegative", () => {
    const model = new BaselineTransformer(TRANSFORMER_CONFIG);
    for (const p of model.forward(EMBEDDINGS)) {
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  test("forward_FlatEmbedding_ReturnsValidDistribution", () => {
    const model = new BaselineTransformer(TRANSFORMER_CONFIG);
    const probs = model.forward([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(probs).toHaveLength(TRANSFORMER_CONFIG.nClasses);
    expect(probs.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0, 10);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("BaselineTransformer — determinism", () => {
  test("forward_SameInputTwice_ReturnsSameOutput", () => {
    const model = new BaselineTransformer(TRANSFORMER_CONFIG);
    expect(model.forward(EMBEDDINGS)).toEqual(model.forward(EMBEDDINGS));
  });

  test("forward_SameSeedTwoInstances_ReturnsSameOutput", () => {
    const a = new BaselineTransformer(TRANSFORMER_CONFIG, 7);
    const b = new BaselineTransformer(TRANSFORMER_CONFIG, 7);
    expect(a.forward(EMBEDDINGS)).toEqual(b.forward(EMBEDDINGS));
  });
});

// ── Config validation ─────────────────────────────────────────────────────────

describe("BaselineTransformer — config validation", () => {
  test("constructor_EmbedDimNotDivisibleByNHeads_Throws", () => {
    expect(() => new BaselineTransformer({ ...TRANSFORMER_CONFIG, nHeads: 3 }))
      .toThrow("divisible");
  });
});

// ── Parameter count — within 10% of CTM ──────────────────────────────────────

describe("BaselineTransformer — parameter count matches CTM within 10%", () => {
  test("countParameters_TransformerWithin10PercentOfCTM", () => {
    const ctm = new ContinuousThoughtModel(CTM_CONFIG);
    const transformer = new BaselineTransformer(TRANSFORMER_CONFIG);
    const ctmParams = ctm.countParameters();
    const tParams   = transformer.countParameters();
    const delta = Math.abs(ctmParams - tParams) / ctmParams;
    expect(delta).toBeLessThan(0.10);
  });

  test("countParameters_CTM_MatchesExpected870", () => {
    const ctm = new ContinuousThoughtModel(CTM_CONFIG);
    expect(ctm.countParameters()).toBe(870);
  });

  test("countParameters_Transformer_MatchesExpected857", () => {
    const transformer = new BaselineTransformer(TRANSFORMER_CONFIG);
    expect(transformer.countParameters()).toBe(857);
  });
});
