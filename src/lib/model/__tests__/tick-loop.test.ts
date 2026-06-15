import { describe, expect, test } from "bun:test";
import { tickLoop, MAX_TICKS, DEFAULT_CONFIDENCE_THRESHOLD } from "../tick-loop";
import { SyncAttention } from "../sync-attention";
import { ConfidenceHead } from "../confidence-head";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const N_NEURONS = 3;
const EMBED_DIM = 4;
const QUERY_DIM = 4;
const VALUE_DIM = N_NEURONS; // valueDim = nNeurons so neuron update is simple

function makeComponents(seed = 42) {
  const attention = new SyncAttention(
    { nNeurons: N_NEURONS, embedDim: EMBED_DIM, queryDim: QUERY_DIM, valueDim: VALUE_DIM },
    seed,
  );
  const confHead = new ConfidenceHead({ nNeurons: N_NEURONS, hiddenDim: 8 }, seed);
  return { attention, confHead };
}

const EMBEDDINGS = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
];

// ── Output shape & types ──────────────────────────────────────────────────────

describe("tickLoop — output shape", () => {
  test("tickLoop_DefaultConfig_ReturnsContextOfValueDim", () => {
    const { attention, confHead } = makeComponents();
    const result = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS);
    expect(result.context).toHaveLength(VALUE_DIM);
  });

  test("tickLoop_DefaultConfig_ConfidenceInUnitInterval", () => {
    const { attention, confHead } = makeComponents();
    const { confidence } = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  test("tickLoop_DefaultConfig_TicksRunPositive", () => {
    const { attention, confHead } = makeComponents();
    const { ticksRun } = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS);
    expect(ticksRun).toBeGreaterThan(0);
  });
});

// ── Max ticks cap ─────────────────────────────────────────────────────────────

describe("tickLoop — maxTicks cap", () => {
  test("tickLoop_HighThreshold_RunsExactlyMaxTicks", () => {
    const { attention, confHead } = makeComponents();
    // threshold of 1.0 is unreachable (sigmoid output is always < 1)
    const maxTicks = 5;
    const result = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS, {
      maxTicks,
      confidenceThreshold: 1.0,
    });
    expect(result.ticksRun).toBe(maxTicks);
    expect(result.converged).toBe(false);
  });

  test("tickLoop_MaxTicksOne_RunsOneTick", () => {
    const { attention, confHead } = makeComponents();
    const result = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS, {
      maxTicks: 1,
      confidenceThreshold: 1.0,
    });
    expect(result.ticksRun).toBe(1);
  });
});

// ── Early stopping ─────────────────────────────────────────────────────────────

describe("tickLoop — early stopping on confidence", () => {
  test("tickLoop_ZeroThreshold_ConvergesOnFirstTick", () => {
    const { attention, confHead } = makeComponents();
    // threshold of 0 — any positive confidence (which sigmoid always gives) triggers stop
    const result = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS, {
      confidenceThreshold: 0,
    });
    expect(result.converged).toBe(true);
    expect(result.ticksRun).toBe(1);
  });

  test("tickLoop_Converged_TicksRunLessThanMaxTicks", () => {
    const { attention, confHead } = makeComponents();
    const result = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS, {
      maxTicks: MAX_TICKS,
      confidenceThreshold: 0, // converge immediately
    });
    expect(result.ticksRun).toBeLessThan(MAX_TICKS);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("tickLoop — determinism", () => {
  test("tickLoop_SameInputTwice_ReturnsSameResult", () => {
    const { attention, confHead } = makeComponents();
    const a = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS);
    const b = tickLoop(attention, confHead, EMBEDDINGS, N_NEURONS);
    expect(a.context).toEqual(b.context);
    expect(a.confidence).toBe(b.confidence);
    expect(a.ticksRun).toBe(b.ticksRun);
    expect(a.converged).toBe(b.converged);
  });
});
