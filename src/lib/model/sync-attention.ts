import { matVec, dot, scale, softmax, flatten } from "./linalg";

/**
 * SyncAttention
 *
 * Cross-attention layer where:
 *   - The QUERY is derived from the sync matrix (N×N pairwise neuron correlations).
 *   - The KEY and VALUE are derived from the input embedding (embedDim-dimensional vector).
 *
 * This answers: "given the current synchronisation state of the network,
 * which part of the input should we focus on?"
 *
 * Architecture (single-head, single key-value pair):
 *
 *   q = W_q  · flatten(syncMatrix)          shape: (queryDim,)
 *   k = W_k  · embedding                    shape: (queryDim,)
 *   v = W_v  · embedding                    shape: (valueDim,)
 *
 *   score  = q · k / sqrt(queryDim)         scalar
 *   weight = softmax([score])               = 1.0 for a single key
 *   ctx    = weight * v                     shape: (valueDim,)
 *
 * With multiple key-value pairs (embeddings stacked as rows of a matrix),
 * each row is projected to its own k_i / v_i and attended jointly.
 * The context is the weighted sum of the v_i vectors.
 *
 * Weights are initialised with a seeded Xavier-style uniform distribution
 * so the layer is deterministic and ready for gradient updates.
 */
export interface SyncAttentionConfig {
  /** Number of neurons N; sync matrix is N×N, flattened to N² for W_q */
  nNeurons: number;
  /** Dimensionality of the input embedding (key/value source) */
  embedDim: number;
  /** Dimensionality of the query and key projections */
  queryDim: number;
  /** Dimensionality of the value projection (= output size) */
  valueDim: number;
}

export class SyncAttention {
  readonly config: SyncAttentionConfig;

  /** W_q: (queryDim × N²) — projects flattened sync matrix → query */
  readonly Wq: number[][];
  /** W_k: (queryDim × embedDim) — projects embedding → key */
  readonly Wk: number[][];
  /** W_v: (valueDim × embedDim) — projects embedding → value */
  readonly Wv: number[][];

  constructor(config: SyncAttentionConfig, seed = 42) {
    this.config = config;
    const { nNeurons, embedDim, queryDim, valueDim } = config;
    const syncFlatDim = nNeurons * nNeurons;

    this.Wq = initWeights(queryDim, syncFlatDim, syncFlatDim, seed);
    this.Wk = initWeights(queryDim, embedDim, embedDim, seed + 1);
    this.Wv = initWeights(valueDim, embedDim, embedDim, seed + 2);
  }

  /**
   * Returns the attention weight for each embedding position given the sync matrix.
   * Weights are in [0, 1] and always sum to exactly 1.0.
   * Useful for interpretability: which input positions does the sync state attend to?
   *
   * @param syncMatrix  N×N pairwise correlation matrix
   * @param embeddings  Sequence of embedding vectors (shape: seqLen × embedDim)
   * @returns           Weight vector of shape (seqLen,)
   */
  computeWeights(syncMatrix: number[][], embeddings: number[][]): number[] {
    const { queryDim } = this.config;
    const syncFlat = flatten(syncMatrix);
    const query = matVec(this.Wq, syncFlat);
    const scale_factor = 1 / Math.sqrt(queryDim);
    const scores = embeddings.map((emb) => dot(query, matVec(this.Wk, emb)) * scale_factor);
    return softmax(scores);
  }

  /**
   * Forward pass.
   *
   * @param syncMatrix  N×N pairwise correlation matrix (each entry in [-1, 1])
   * @param embeddings  One or more embedding vectors; each row is one position.
   *                    Shape: (seqLen × embedDim). Pass a single vector as [[...]] or [...].
   * @returns           Context vector of shape (valueDim,)
   */
  forward(syncMatrix: number[][], embeddings: number[][] | number[]): number[] {
    const { queryDim, valueDim } = this.config;

    // Normalise embeddings to always be number[][]
    const seqs: number[][] = Array.isArray(embeddings[0])
      ? (embeddings as number[][])
      : [(embeddings as number[])];

    // Query from sync matrix (single query for the whole sequence)
    const syncFlat = flatten(syncMatrix);
    const query = matVec(this.Wq, syncFlat); // (queryDim,)

    const scale_factor = 1 / Math.sqrt(queryDim);

    // Compute scores and values for each embedding position
    const scores: number[] = seqs.map((emb) => {
      const key = matVec(this.Wk, emb); // (queryDim,)
      return dot(query, key) * scale_factor;
    });

    const weights = softmax(scores); // (seqLen,)

    // Weighted sum of projected values
    let context: number[] = new Array(valueDim).fill(0);
    for (let i = 0; i < seqs.length; i++) {
      const value = matVec(this.Wv, seqs[i]); // (valueDim,)
      context = context.map((v, j) => v + weights[i] * value[j]);
    }

    return context;
  }
}

// ── Weight initialisation ─────────────────────────────────────────────────────

/**
 * Xavier uniform initialisation: U(-limit, limit) where limit = sqrt(6 / fanIn).
 * Uses a seeded LCG so weights are deterministic across runs.
 */
function initWeights(
  rows: number,
  cols: number,
  fanIn: number,
  seed: number,
): number[][] {
  const limit = Math.sqrt(6 / fanIn);
  let state = seed >>> 0;

  function next(): number {
    // LCG parameters from Numerical Recipes
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff; // [0, 1)
  }

  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (next() * 2 - 1) * limit),
  );
}
