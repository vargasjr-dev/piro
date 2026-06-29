/**
 * CTM — Continuous Thought Machine
 *
 * The core forward-pass orchestrator for the biologically-inspired,
 * RL-first model architecture. Combines NeuronLayer, NeuronHistory,
 * correlation, and SyncAttention into an adaptive-tick inference loop.
 *
 * ## Forward Pass
 *
 * ```
 * input embedding (D)
 *      ↓
 * NeuronLayer.forward(input)     → activations[N]
 *      ↓
 * NeuronHistory.push(activations)  → rolling window
 *      ↓  (repeat until warm)
 * correlationMatrix(activations) → syncMatrix[N × N]
 *      ↓
 * SyncAttention.forward(syncMatrix, input embedding) → context vector
 *      ↓
 * [repeat: context becomes new "input", feeding NeuronLayer again]
 *      ↓  (when confidence exceeds threshold OR maxTicks reached)
 * OutputHead(syncMatrix) → class distribution
 * ```
 *
 * The key innovation: the model iterates internally, letting its own
 * synchronization state gate further processing — like a biological
 * neural circuit that reverberates before producing an output.
 */

import { NeuronLayer } from "./neuron-layer";
import { NeuronHistory } from "./neuron-history";
import { correlationMatrix } from "./correlation";
import { SyncAttention } from "./sync-attention";

export interface CTMConfig {
  /** Number of neurons (N) */
  numNeurons: number;
  /** Input embedding dimension (D) */
  inputDim: number;
  /** Hidden dimension per-neuron MLP (H) */
  hiddenDim: number;
  /** Rolling history window size (W) */
  windowSize: number;
  /** Max adaptive ticks before forced output */
  maxTicks: number;
  /** Confidence threshold [0, 1] — once sync entropy drops below this, emit */
  confidenceThreshold: number;
  /** Activation function for neuron MLPs */
  activation?: "relu" | "sigmoid" | "tanh";
  /** Number of output classes (for classification head) */
  numClasses: number;
}

export interface CTMStep {
  tick: number;
  /** Per-neuron activations (length N) */
  activations: number[];
  /** Sync matrix as 2-D [N × N] */
  syncMatrix: number[][];
  /** Attention context vector (length valueDim) */
  context: number[];
  /** Entropy proxy [0, 1] */
  entropy: number;
  /** Output logits once produced (length numClasses) */
  output?: number[];
}

/** Default config for a small CTM model (~33K params). */
export const DEFAULT_CTM_CONFIG: CTMConfig = {
  numNeurons: 64,
  inputDim: 32,
  hiddenDim: 16,
  windowSize: 16,
  maxTicks: 10,
  confidenceThreshold: 0.85,
  activation: "relu",
  numClasses: 10,
};

/**
 * Convert flat neuron-major activation buffer to number[][] for
 * the correlationMatrix API.
 */
function flatToActMatrix(
  flat: Float64Array,
  numNeurons: number,
  windowSz: number,
): number[][] {
  const matrix: number[][] = [];
  for (let n = 0; n < numNeurons; n++) {
    const row: number[] = [];
    for (let t = 0; t < windowSz; t++) {
      row.push(flat[n * windowSz + t]);
    }
    matrix.push(row);
  }
  return matrix;
}

export class CTM {
  readonly config: CTMConfig;
  readonly neuronLayer: NeuronLayer;
  readonly history: NeuronHistory;
  readonly syncAttention: SyncAttention;

  // Output projection: flatten(syncMatrix[N×N]) → numClasses
  private outputW: number[][];
  private outputB: number[];

  constructor(config: Partial<CTMConfig> = {}) {
    this.config = { ...DEFAULT_CTM_CONFIG, ...config };
    const c = this.config;

    this.neuronLayer = new NeuronLayer(
      c.numNeurons,
      c.inputDim,
      c.hiddenDim,
      c.activation,
    );

    this.history = new NeuronHistory(c.numNeurons, c.windowSize);

    // SyncAttention config: use numNeurons for sync dim,
    // inputDim for embedding dim, matching defaults
    this.syncAttention = new SyncAttention({
      nNeurons: c.numNeurons,
      embedDim: c.inputDim,
      queryDim: c.inputDim,
      valueDim: c.inputDim,
    });

    // Output head: flatten(syncMatrix) [N²] → numClasses
    const syncFlatDim = c.numNeurons * c.numNeurons;
    const scale = Math.sqrt(2.0 / (syncFlatDim + c.numClasses));
    this.outputW = [];
    for (let cIdx = 0; cIdx < c.numClasses; cIdx++) {
      const row: number[] = [];
      for (let j = 0; j < syncFlatDim; j++) {
        row.push(randn() * scale);
      }
      this.outputW.push(row);
    }
    this.outputB = [];
    for (let cIdx = 0; cIdx < c.numClasses; cIdx++) {
      this.outputB.push(randn() * 0.01);
    }
  }

  /**
   * Run the full CTM forward pass on an input embedding.
   *
   * @param input — input embedding vector (length inputDim)
   * @param steps  — optional array to collect per-tick snapshots
   * @returns — output logits (length numClasses)
   */
  forward(
    input: number[],
    steps?: CTMStep[],
  ): number[] {
    const c = this.config;

    // Step 1: Warm-up — fill the history window
    // During warmup we feed activations[N] truncated to inputDim[D] as input
    let currentInput: number[] = input;
    for (let t = 0; t < c.windowSize; t++) {
      const activations = this.neuronLayer.forward(currentInput);
      this.history.push(activations);
      currentInput = Array.from(activations.slice(0, c.inputDim));
    }

    // Step 2: Adaptive-tick loop
    let finalOutput: number[] | null = null;

    for (let tick = 0; tick < c.maxTicks; tick++) {
      const windowSz = this.history.size;
      const flatActs = this.history.toActivationMatrix();
      const actMatrix = flatToActMatrix(flatActs, c.numNeurons, windowSz);

      // Build sync matrix [N × N]
      const syncMatrix = correlationMatrix(actMatrix);

      // Sync attention — expects number[][] for sync, number[] for embedding
      const context = this.syncAttention.forward(syncMatrix, currentInput);

      // Compute entropy as a confidence measure
      const entropy = this.computeEntropy(syncMatrix);

      // Check confidence — if entropy is low enough, produce output
      if (entropy <= 1.0 - c.confidenceThreshold) {
        finalOutput = this.classify(syncMatrix);
      }

      if (steps) {
        steps.push({
          tick,
          activations: Array.from(this.history.getLatest()),
          syncMatrix,
          context,
          entropy,
          output: finalOutput ?? undefined,
        });
      }

      if (finalOutput) break;

      // Feed context back as next input and compute next activations
      currentInput = context;
      const activations = this.neuronLayer.forward(currentInput);
      this.history.push(activations);
      currentInput = Array.from(activations.slice(0, c.inputDim));
    }

    // If never hit threshold, classify from last state
    if (!finalOutput) {
      const windowSz = this.history.size;
      const flatActs = this.history.toActivationMatrix();
      const actMatrix = flatToActMatrix(flatActs, c.numNeurons, windowSz);
      const syncMatrix = correlationMatrix(actMatrix);
      finalOutput = this.classify(syncMatrix);
    }

    return finalOutput;
  }

  /** Project sync matrix [N × N] → logits [numClasses]. */
  private classify(syncMatrix: number[][]): number[] {
    const c = this.config;
    // Flatten sync matrix
    const flat: number[] = [];
    for (let i = 0; i < c.numNeurons; i++) {
      for (let j = 0; j < c.numNeurons; j++) {
        flat.push(syncMatrix[i][j]);
      }
    }
    const logits: number[] = [];
    for (let cIdx = 0; cIdx < c.numClasses; cIdx++) {
      let logit = this.outputB[cIdx];
      const row = this.outputW[cIdx];
      for (let j = 0; j < flat.length; j++) {
        logit += row[j] * flat[j];
      }
      logits.push(logit);
    }
    return logits;
  }

  /**
   * Compute entropy of the synchrony distribution from the sync matrix.
   *
   * We take the mean absolute correlation as a proxy for "how coherent"
   * the neurons are. Low entropy = high synchrony = ready to emit.
   * Returns a value in [0, 1] where 0 = perfectly synchronized.
   */
  private computeEntropy(syncMatrix: number[][]): number {
    const n = this.config.numNeurons;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          sum += Math.abs(syncMatrix[i][j]);
          count++;
        }
      }
    }
    // Normalize to [0, 1]: 0 = all perfectly correlated, 1 = no correlation
    return 1.0 - (count > 0 ? sum / count : 0.0);
  }

  /** Reset the model state (history buffer). */
  reset(): void {
    this.history.clear();
  }

  /**
   * Total number of learnable parameters.
   * (NeuronLayer + SyncAttention weights + output head)
   */
  get paramCount(): number {
    const c = this.config;
    const syncFlatDim = c.numNeurons * c.numNeurons;
    return (
      this.neuronLayer.paramCount +
      syncFlatDim * c.numClasses +   // outputW
      c.numClasses                   // outputB
    );
  }
}

/** Simple seeded RNG for parameter init. */
let _seed = 42;
function randn(): number {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = (_seed = (_seed * 16807) % 2147483647) / 2147483647;
  while (v === 0) v = (_seed = (_seed * 16807) % 2147483647) / 2147483647;
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
