import { SyncAttention } from "./sync-attention";
import { ConfidenceHead } from "./confidence-head";
import { pearsonCorrelation } from "./correlation";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_TICKS = 32;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.9;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TickLoopConfig {
  maxTicks?: number;
  confidenceThreshold?: number;
}

export interface TickLoopResult {
  /** Final context vector produced by the last attention step */
  context: number[];
  /** Final confidence score [0, 1] */
  confidence: number;
  /** Number of ticks actually executed */
  ticksRun: number;
  /** true if stopped because confidence exceeded threshold, false if maxTicks reached */
  converged: boolean;
  /** Structured log entry — suitable for appending to an audit trail or metrics system */
  log: TickLoopLog;
}

export interface TickLoopLog {
  ticksRun: number;
  maxTicks: number;
  converged: boolean;
  confidence: number;
  confidenceThreshold: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute the N×N pairwise Pearson correlation matrix for a set of neuron
 * activation sequences. neuronActivations[i] is the activation history of
 * neuron i (length = ticks so far). Returns the identity matrix when fewer
 * than 2 ticks have elapsed (correlation undefined).
 */
function computeSyncMatrix(neuronActivations: number[][]): number[][] {
  const n = neuronActivations.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1;
      // Need at least 2 timesteps for Pearson correlation
      if (neuronActivations[i].length < 2) return 0;
      return pearsonCorrelation(neuronActivations[i], neuronActivations[j]);
    }),
  );
}

/**
 * Update neuron activations given the new context vector.
 * Each neuron i takes the i-th component of the context (mod valueDim)
 * and appends it to its history.
 */
function updateNeurons(
  neuronActivations: number[][],
  context: number[],
): void {
  const n = neuronActivations.length;
  for (let i = 0; i < n; i++) {
    neuronActivations[i].push(context[i % context.length]);
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * TickLoop — the Piro model's inference loop.
 *
 * Each tick:
 *   1. Attend — SyncAttention produces a context vector from the sync matrix + embeddings
 *   2. Update neurons — append context components to neuron activation histories
 *   3. Recompute sync matrix — Pearson correlations over the updated activation histories
 *   4. Check confidence — ConfidenceHead scores the new sync matrix; stop if above threshold
 *
 * Stops early when confidence > threshold, or after maxTicks iterations.
 *
 * @param attention    Initialised SyncAttention layer
 * @param confHead     Initialised ConfidenceHead
 * @param embeddings   Input token embeddings (seqLen × embedDim)
 * @param nNeurons     Number of neurons in the network
 * @param config       Optional: maxTicks, confidenceThreshold
 */
export function tickLoop(
  attention: SyncAttention,
  confHead: ConfidenceHead,
  embeddings: number[][],
  nNeurons: number,
  config: TickLoopConfig = {},
): TickLoopResult {
  const maxTicks = config.maxTicks ?? MAX_TICKS;
  const threshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  // Each neuron starts with an empty activation history
  const neuronActivations: number[][] = Array.from({ length: nNeurons }, () => []);

  // Seed the sync matrix as identity (diagonal = 1, off-diagonal = 0)
  // before we have enough history for Pearson correlation
  let syncMatrix = computeSyncMatrix(neuronActivations); // starts as identity (no history)

  let context: number[] = new Array(attention.config.valueDim).fill(0);
  let confidence = 0;
  let tick = 0;

  for (tick = 0; tick < maxTicks; tick++) {
    // 1. Attend
    context = attention.forward(syncMatrix, embeddings);

    // 2. Update neurons
    updateNeurons(neuronActivations, context);

    // 3. Recompute sync matrix
    syncMatrix = computeSyncMatrix(neuronActivations);

    // 4. Check confidence
    confidence = confHead.forward(syncMatrix);
    if (confidence > threshold) {
      tick++; // count this tick
      break;
    }
  }

  const converged = confidence > threshold;
  const log: TickLoopLog = {
    ticksRun: tick,
    maxTicks,
    converged,
    confidence,
    confidenceThreshold: threshold,
  };

  return { context, confidence, ticksRun: tick, converged, log };
}
