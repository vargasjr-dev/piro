import { softmax } from "./linalg";

/**
 * BaselineTransformer
 *
 * A minimal 2-layer transformer (multi-head self-attention + FFN) for
 * apples-to-apples comparison with ContinuousThoughtModel.
 *
 * Designed to match ContinuousThoughtModel's parameter count within 10%
 * at the default benchmark config (embedDim=8, ffnDim=13 → 871 params vs CTM 870).
 *
 * Architecture per layer:
 *   x' = LayerNorm(x + MultiHeadSelfAttention(x))
 *   x'' = LayerNorm(x' + FFN(x'))
 *
 * Output:
 *   logits = softmax(W_out · mean_pool(final_hidden) + b_out)
 *
 * No positional encoding — inputs are bags of embeddings (same assumption as CTM).
 * Weights are deterministically initialised with seeded Xavier uniform.
 */
export interface BaselineTransformerConfig {
  /** Input/output embedding dimension */
  embedDim: number;
  /** Number of attention heads (embedDim must be divisible by nHeads) */
  nHeads: number;
  /** FFN hidden dimension */
  ffnDim: number;
  /** Number of transformer layers */
  nLayers: number;
  /** Number of output classes */
  nClasses: number;
}

// ── Internal weight structures ────────────────────────────────────────────────

interface AttentionWeights {
  Wq: number[][];  // (embedDim × embedDim)
  Wk: number[][];
  Wv: number[][];
  Wo: number[][];
}

interface FFNWeights {
  W1: number[][];  // (ffnDim × embedDim)
  b1: number[];
  W2: number[][];  // (embedDim × ffnDim)
  b2: number[];
}

interface LayerNormWeights {
  scale: number[];  // (embedDim,) — initialised to 1
  bias:  number[];  // (embedDim,) — initialised to 0
}

interface TransformerLayer {
  attn:  AttentionWeights;
  ffn:   FFNWeights;
  ln1:   LayerNormWeights;
  ln2:   LayerNormWeights;
}

// ── Main class ────────────────────────────────────────────────────────────────

export class BaselineTransformer {
  readonly config: BaselineTransformerConfig;

  private readonly layers: TransformerLayer[];
  private readonly lnFinal: LayerNormWeights;
  private readonly Wout: number[][];  // (nClasses × embedDim)
  private readonly bout: number[];    // (nClasses,)

  constructor(config: BaselineTransformerConfig, seed = 42) {
    if (config.embedDim % config.nHeads !== 0) {
      throw new Error(
        `embedDim (${config.embedDim}) must be divisible by nHeads (${config.nHeads})`,
      );
    }
    this.config = config;
    const { embedDim, ffnDim, nLayers, nClasses } = config;
    let s = seed;

    this.layers = Array.from({ length: nLayers }, () => {
      const attn: AttentionWeights = {
        Wq: xavier(embedDim, embedDim, embedDim, s++),
        Wk: xavier(embedDim, embedDim, embedDim, s++),
        Wv: xavier(embedDim, embedDim, embedDim, s++),
        Wo: xavier(embedDim, embedDim, embedDim, s++),
      };
      const ffn: FFNWeights = {
        W1: xavier(ffnDim, embedDim, embedDim, s++),
        b1: new Array(ffnDim).fill(0),
        W2: xavier(embedDim, ffnDim, ffnDim, s++),
        b2: new Array(embedDim).fill(0),
      };
      return {
        attn,
        ffn,
        ln1: { scale: new Array(embedDim).fill(1), bias: new Array(embedDim).fill(0) },
        ln2: { scale: new Array(embedDim).fill(1), bias: new Array(embedDim).fill(0) },
      };
    });

    this.lnFinal = { scale: new Array(embedDim).fill(1), bias: new Array(embedDim).fill(0) };
    this.Wout = xavier(nClasses, embedDim, embedDim, s++);
    this.bout = new Array(nClasses).fill(0);
  }

  /**
   * Forward pass.
   * @param embeddings  (seqLen × embedDim) or flat (embedDim,) vector
   * @returns           Probability distribution over nClasses (sums to 1.0)
   */
  forward(embeddings: number[][] | number[]): number[] {
    const seqs: number[][] = Array.isArray(embeddings[0])
      ? (embeddings as number[][])
      : [(embeddings as number[])];

    let hidden = seqs.map((e) => [...e]);  // deep copy to avoid mutation

    for (const layer of this.layers) {
      hidden = this.applyLayer(hidden, layer);
    }

    // Apply final layer norm
    hidden = hidden.map((h) => layerNorm(h, this.lnFinal));

    // Mean pool over sequence → (embedDim,)
    const pooled = meanPool(hidden);

    // Project to logits → softmax
    const logits = matVec(this.Wout, pooled).map((v, i) => v + this.bout[i]);
    return softmax(logits);
  }

  /**
   * Count all trainable scalar parameters.
   */
  countParameters(): number {
    const { embedDim, ffnDim, nLayers, nClasses } = this.config;
    // Per layer: attn (4×d²) + FFN (d×ffn+ffn + ffn×d+d) + 2×LN (2×d each)
    const perLayer =
      4 * embedDim * embedDim                       // attn, no bias
      + (ffnDim * embedDim + ffnDim)                // FFN W1 + b1
      + (embedDim * ffnDim + embedDim)              // FFN W2 + b2
      + 2 * (2 * embedDim);                         // 2 × LayerNorm
    const outputLayer = nClasses * embedDim + nClasses; // Wout + bout
    const finalLN = 2 * embedDim;
    return nLayers * perLayer + outputLayer + finalLN;
  }

  // ── Internal layer forward ─────────────────────────────────────────────────

  private applyLayer(
    hidden: number[][],
    layer: TransformerLayer,
  ): number[][] {
    // Multi-head self-attention with residual + LN
    const attnOut = this.multiHeadSelfAttention(hidden, layer.attn);
    const res1 = hidden.map((h, i) => h.map((v, j) => v + attnOut[i][j]));
    const normed1 = res1.map((h) => layerNorm(h, layer.ln1));

    // FFN with residual + LN
    const ffnOut = normed1.map((h) => applyFFN(h, layer.ffn));
    const res2 = normed1.map((h, i) => h.map((v, j) => v + ffnOut[i][j]));
    const normed2 = res2.map((h) => layerNorm(h, layer.ln2));

    return normed2;
  }

  private multiHeadSelfAttention(
    hidden: number[][],
    w: AttentionWeights,
  ): number[][] {
    const { embedDim, nHeads } = this.config;
    const headDim = embedDim / nHeads;
    const scale = Math.sqrt(headDim);
    const seqLen = hidden.length;

    // Project to Q, K, V (full embedDim, then split into heads)
    const Q = hidden.map((h) => matVec(w.Wq, h));
    const K = hidden.map((h) => matVec(w.Wk, h));
    const V = hidden.map((h) => matVec(w.Wv, h));

    // Concatenated output from all heads: (seqLen × embedDim)
    const headOutputs: number[][] = Array.from({ length: seqLen }, () =>
      new Array(embedDim).fill(0),
    );

    for (let h = 0; h < nHeads; h++) {
      const start = h * headDim;
      const end = start + headDim;

      // Slice head-specific subspaces
      const Qh = Q.map((q) => q.slice(start, end));  // (seq, headDim)
      const Kh = K.map((k) => k.slice(start, end));
      const Vh = V.map((v) => v.slice(start, end));

      // Attention scores: (seq, seq)
      const scores = Qh.map((qi) =>
        softmax(Kh.map((kj) => dot(qi, kj) / scale)),
      );

      // Weighted value sum for this head: (seq, headDim)
      for (let i = 0; i < seqLen; i++) {
        for (let d = 0; d < headDim; d++) {
          headOutputs[i][start + d] = scores[i].reduce(
            (s, w, j) => s + w * Vh[j][d],
            0,
          );
        }
      }
    }

    // Output projection
    return headOutputs.map((o) => matVec(w.Wo, o));
  }
}

// ── Linear algebra helpers ────────────────────────────────────────────────────

function matVec(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((s, w, j) => s + w * v[j], 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function meanPool(seqs: number[][]): number[] {
  const d = seqs[0].length;
  return Array.from({ length: d }, (_, j) =>
    seqs.reduce((s, h) => s + h[j], 0) / seqs.length,
  );
}

function layerNorm(x: number[], w: LayerNormWeights, eps = 1e-5): number[] {
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length;
  const std = Math.sqrt(variance + eps);
  return x.map((v, i) => w.scale[i] * ((v - mean) / std) + w.bias[i]);
}

function applyFFN(x: number[], w: FFNWeights): number[] {
  const hidden = matVec(w.W1, x).map((v, i) => Math.max(0, v + w.b1[i])); // ReLU
  return matVec(w.W2, hidden).map((v, i) => v + w.b2[i]);
}

function xavier(rows: number, cols: number, fanIn: number, seed: number): number[][] {
  const limit = Math.sqrt(6 / fanIn);
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (next() * 2 - 1) * limit),
  );
}
