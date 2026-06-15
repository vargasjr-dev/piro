import { matVec, flatten } from "./linalg";

/**
 * ConfidenceHead
 *
 * A small two-layer MLP that maps the sync matrix (N×N pairwise correlations)
 * to a scalar confidence score in [0, 1].
 *
 * Architecture:
 *   h = ReLU(W1 · flatten(syncMatrix) + b1)   shape: (hiddenDim,)
 *   y = sigmoid(W2 · h + b2)                   scalar
 *
 * Weights are deterministically initialised with seeded Xavier uniform,
 * biases at zero.
 */
export interface ConfidenceHeadConfig {
  /** Number of neurons N; input is N×N = N² features */
  nNeurons: number;
  /** Number of hidden units */
  hiddenDim: number;
}

export class ConfidenceHead {
  readonly config: ConfidenceHeadConfig;

  /** W1: (hiddenDim × N²) */
  readonly W1: number[][];
  /** b1: (hiddenDim,) — initialised to zero */
  readonly b1: number[];
  /** W2: (1 × hiddenDim) */
  readonly W2: number[][];
  /** b2: scalar — initialised to zero */
  readonly b2: number;

  constructor(config: ConfidenceHeadConfig, seed = 42) {
    this.config = config;
    const inputDim = config.nNeurons * config.nNeurons;
    this.W1 = initWeights(config.hiddenDim, inputDim, inputDim, seed);
    this.b1 = new Array(config.hiddenDim).fill(0);
    this.W2 = initWeights(1, config.hiddenDim, config.hiddenDim, seed + 1);
    this.b2 = 0;
  }

  /**
   * Forward pass.
   * @param syncMatrix  N×N pairwise correlation matrix (each entry in [-1, 1])
   * @returns           Confidence score in [0, 1]
   */
  forward(syncMatrix: number[][]): number {
    const x = flatten(syncMatrix);

    // Hidden layer: ReLU(W1·x + b1)
    const preAct = matVec(this.W1, x).map((v, i) => v + this.b1[i]);
    const hidden = preAct.map(relu);

    // Output layer: sigmoid(W2·h + b2)
    const logit = matVec(this.W2, hidden)[0] + this.b2;
    return sigmoid(logit);
  }
}

// ── Activation functions ──────────────────────────────────────────────────────

function relu(x: number): number {
  return x > 0 ? x : 0;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ── Weight initialisation ─────────────────────────────────────────────────────

function initWeights(rows: number, cols: number, fanIn: number, seed: number): number[][] {
  const limit = Math.sqrt(6 / fanIn);
  let state = seed >>> 0;
  function next(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  }
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (next() * 2 - 1) * limit),
  );
}
