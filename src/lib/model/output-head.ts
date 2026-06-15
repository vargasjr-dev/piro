import { matVec, softmax, flatten } from "./linalg";

/**
 * OutputHead
 *
 * MLP that maps the sync matrix (N×N pairwise correlations) to a probability
 * distribution over a fixed vocabulary of classes.
 *
 * Architecture:
 *   h = ReLU(W1 · flatten(syncMatrix) + b1)   shape: (hiddenDim,)
 *   logits = W2 · h + b2                       shape: (nClasses,)
 *   probs  = softmax(logits)                   shape: (nClasses,)
 *
 * Weights are deterministically initialised with seeded Xavier uniform,
 * biases at zero.
 */
export interface OutputHeadConfig {
  /** Number of neurons N; input is N×N = N² features */
  nNeurons: number;
  /** Number of hidden units */
  hiddenDim: number;
  /** Number of output classes */
  nClasses: number;
}

export class OutputHead {
  readonly config: OutputHeadConfig;

  /** W1: (hiddenDim × N²) */
  readonly W1: number[][];
  /** b1: (hiddenDim,) — initialised to zero */
  readonly b1: number[];
  /** W2: (nClasses × hiddenDim) */
  readonly W2: number[][];
  /** b2: (nClasses,) — initialised to zero */
  readonly b2: number[];

  constructor(config: OutputHeadConfig, seed = 42) {
    this.config = config;
    const inputDim = config.nNeurons * config.nNeurons;
    this.W1 = initWeights(config.hiddenDim, inputDim, inputDim, seed);
    this.b1 = new Array(config.hiddenDim).fill(0);
    this.W2 = initWeights(config.nClasses, config.hiddenDim, config.hiddenDim, seed + 1);
    this.b2 = new Array(config.nClasses).fill(0);
  }

  /**
   * Forward pass.
   * @param syncMatrix  N×N pairwise correlation matrix (entries in [-1, 1])
   * @returns           Probability distribution over nClasses (sums to 1.0)
   */
  forward(syncMatrix: number[][]): number[] {
    const x = flatten(syncMatrix);

    // Hidden layer: ReLU(W1·x + b1)
    const hidden = matVec(this.W1, x)
      .map((v, i) => Math.max(0, v + this.b1[i]));

    // Output logits: W2·h + b2
    const logits = matVec(this.W2, hidden)
      .map((v, i) => v + this.b2[i]);

    return softmax(logits);
  }
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
