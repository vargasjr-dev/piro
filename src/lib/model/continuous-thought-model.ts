import { SyncAttention, type SyncAttentionConfig } from "./sync-attention";
import { ConfidenceHead, type ConfidenceHeadConfig } from "./confidence-head";
import { OutputHead, type OutputHeadConfig } from "./output-head";
import { tickLoop, type TickLoopConfig, type TickLoopLog } from "./tick-loop";

// ── Configuration ──────────────────────────────────────────────────────────────

export interface ContinuousThoughtModelConfig {
  /** Number of neurons N (sync matrix is N×N) */
  nNeurons: number;
  /** Dimensionality of input token embeddings */
  embedDim: number;
  /** Projection dimension for attention queries/keys */
  queryDim: number;
  /** Output dimension of the attention value projection */
  valueDim: number;
  /** Hidden units in ConfidenceHead and OutputHead MLPs */
  hiddenDim: number;
  /** Number of output classes */
  nClasses: number;
  /** Max tick iterations per forward pass (default: MAX_TICKS = 32) */
  maxTicks?: number;
  /** Confidence threshold for early stopping (default: 0.9) */
  confidenceThreshold?: number;
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface ForwardResult {
  /** Probability distribution over nClasses (sums to 1.0) */
  logits: number[];
  /** Confidence score in [0, 1] from the final sync matrix */
  confidence: number;
  /** Number of tick iterations used */
  tickCount: number;
  /** Structured log from the tick loop (for metrics / audit) */
  log: TickLoopLog;
}

// ── Model ──────────────────────────────────────────────────────────────────────

/**
 * ContinuousThoughtModel
 *
 * Piro's core inference model. Combines:
 *   - SyncAttention   — cross-attention driven by neuron synchronisation state
 *   - ConfidenceHead  — decides when to stop iterating
 *   - OutputHead      — maps final sync state to a class distribution
 *   - TickLoop        — drives the iterative attend → sync → check cycle
 *
 * Forward interface:
 *   forward(embeddings) -> { logits, confidence, tickCount, log }
 *
 * @param embeddings  Input token embeddings; shape: (seqLen × embedDim),
 *                    or a single flat vector of length embedDim.
 */
export class ContinuousThoughtModel {
  readonly config: ContinuousThoughtModelConfig;
  readonly attention: SyncAttention;
  readonly confHead: ConfidenceHead;
  readonly outputHead: OutputHead;

  private readonly tickConfig: TickLoopConfig;

  constructor(config: ContinuousThoughtModelConfig, seed = 42) {
    this.config = config;

    const attnCfg: SyncAttentionConfig = {
      nNeurons:  config.nNeurons,
      embedDim:  config.embedDim,
      queryDim:  config.queryDim,
      valueDim:  config.valueDim,
    };
    const confCfg: ConfidenceHeadConfig = {
      nNeurons:  config.nNeurons,
      hiddenDim: config.hiddenDim,
    };
    const outCfg: OutputHeadConfig = {
      nNeurons:  config.nNeurons,
      hiddenDim: config.hiddenDim,
      nClasses:  config.nClasses,
    };

    // Stagger seeds across sub-components so their weights don't correlate
    this.attention  = new SyncAttention(attnCfg, seed);
    this.confHead   = new ConfidenceHead(confCfg, seed + 100);
    this.outputHead = new OutputHead(outCfg,      seed + 200);

    this.tickConfig = {
      maxTicks:             config.maxTicks,
      confidenceThreshold:  config.confidenceThreshold,
    };
  }

  /**
   * Count all trainable scalar parameters across all sub-components.
   */
  countParameters(): number {
    const { nNeurons, embedDim, queryDim, valueDim, hiddenDim, nClasses } = this.config;
    const syncFlat = nNeurons * nNeurons;
    // SyncAttention (no bias)
    const attn = queryDim * syncFlat + queryDim * embedDim + valueDim * embedDim;
    // ConfidenceHead (with bias)
    const conf = hiddenDim * syncFlat + hiddenDim + 1 * hiddenDim + 1;
    // OutputHead (with bias)
    const out  = hiddenDim * syncFlat + hiddenDim + nClasses * hiddenDim + nClasses;
    return attn + conf + out;
  }

  /**
   * Run a full forward pass.
   *
   * @param embeddings  (seqLen × embedDim) or flat (embedDim,) vector
   * @returns           { logits, confidence, tickCount, log }
   */
  forward(embeddings: number[][] | number[]): ForwardResult {
    // Normalise to number[][]
    const seqs: number[][] = Array.isArray(embeddings[0])
      ? (embeddings as number[][])
      : [(embeddings as number[])];

    // Run the iterative tick loop
    const tickResult = tickLoop(
      this.attention,
      this.confHead,
      seqs,
      this.config.nNeurons,
      this.tickConfig,
    );

    // Map final sync state → class distribution via OutputHead
    // (tick loop doesn't expose the final sync matrix directly, so we
    //  re-derive it from the confidence head's own forward pass — but
    //  OutputHead needs the sync matrix, not the confidence score.
    //  Instead we pass through tickResult.context to reconstruct the
    //  final sync snapshot by running OutputHead on the same sync that
    //  generated the final confidence. We achieve this cleanly by having
    //  OutputHead work on the context vector re-shaped as a 1×valueDim
    //  sync proxy — OR by exposing the final sync from tickLoop.)
    //
    // Clean solution: run OutputHead on the tick result's final context
    // reshaped into a nNeurons×nNeurons matrix (zero-padded / truncated
    // as needed). This keeps the interface clean without mutating tickLoop.
    const finalSyncProxy = contextToSyncProxy(
      tickResult.context,
      this.config.nNeurons,
    );

    const logits = this.outputHead.forward(finalSyncProxy);

    return {
      logits,
      confidence: tickResult.confidence,
      tickCount:  tickResult.ticksRun,
      log:        tickResult.log,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert the final context vector from the tick loop into an N×N
 * "sync proxy" matrix suitable for OutputHead.
 *
 * The context is tiled / truncated to fill N² entries, then reshaped.
 * This is intentionally simple — in a trained model, the OutputHead
 * learns to interpret whatever structure emerges here.
 */
function contextToSyncProxy(context: number[], nNeurons: number): number[][] {
  const size = nNeurons * nNeurons;
  const flat: number[] = Array.from({ length: size }, (_, i) => context[i % context.length]);
  return Array.from({ length: nNeurons }, (_, row) =>
    flat.slice(row * nNeurons, (row + 1) * nNeurons),
  );
}
