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
import {
  BurstState,
  type BurstConfig,
  applyBurstWeighting,
} from "./burst-state";
import {
  PlasticSynapse,
  type PlasticConfig,
  DEFAULT_PLASTIC_CONFIG,
} from "./plastic-synapse";

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
  /**
   * Optional burst configuration. When provided, burst-state modulation
   * is applied to activations and the sync matrix during the forward pass.
   * undefined = no burst modulation (backward-compatible).
   */
  burstConfig?: BurstConfig;
  /**
   * Optional plastic synapse configuration. When provided, a Hebbian
   * plastic recurrent weight matrix is added to the model. The plastic
   * weights evolve during the adaptive-tick loop via Oja's rule, creating
   * attractor dynamics that reflect past experience.
   * undefined = no plasticity (backward-compatible).
   */
  plasticConfig?: Partial<PlasticConfig>;
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
  /** Plastic synapse energy (only present when plasticConfig is set) */
  plasticEnergy?: number;
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
  readonly burstState: BurstState | null;
  readonly plasticSynapse: PlasticSynapse | null;

  /** Previous tick's activations (for plastic recurrent pathway) */
  private prevActivations: Float64Array | null = null;

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

    // Conditional burst state — null when no burstConfig provided (backward-compat)
    this.burstState = c.burstConfig
      ? new BurstState(c.burstConfig, c.numNeurons)
      : null;

    // Conditional plastic synapse — null when no plasticConfig provided (backward-compat)
    this.plasticSynapse = c.plasticConfig
      ? new PlasticSynapse(c.plasticConfig, c.numNeurons)
      : null;

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

    /** Helper: push activations into history with optional burst weighting. */
    const pushBurstWeighted = (raw: Float64Array): void => {
      if (this.burstState) {
        this.burstState.tick(raw);
        const weighted = applyBurstWeighting(raw, this.burstState);
        this.history.push(weighted);
      } else {
        this.history.push(raw);
      }
    };

    // Step 1: Warm-up — fill the history window
    // During warmup we feed activations[N] truncated to inputDim[D] as input
    let currentInput: number[] = input;
    for (let t = 0; t < c.windowSize; t++) {
      const activations = this.neuronLayer.forward(currentInput);
      const withPlastic = this.applyPlasticRecurrent(activations);
      pushBurstWeighted(withPlastic);
      // For warm-up, previous activations = current activations (no delay yet)
      this.rememberActivations(withPlastic);
      currentInput = Array.from(withPlastic.slice(0, c.inputDim));
    }

    // Step 2: Adaptive-tick loop
    let finalOutput: number[] | null = null;

    for (let tick = 0; tick < c.maxTicks; tick++) {
      const windowSz = this.history.size;
      const flatActs = this.history.toActivationMatrix();
      const actMatrix = flatToActMatrix(flatActs, c.numNeurons, windowSz);

      // Build sync matrix [N × N]
      let syncMatrix = correlationMatrix(actMatrix);

      // Dual burst modulation: also weight the sync matrix so co-bursting
      // pairs carry more signal (distinguishes sustained from coincidental)
      if (this.burstState) {
        syncMatrix = applyBurstWeightingToSyncMatrix(
          syncMatrix,
          this.burstState,
        );
      }

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
          plasticEnergy: this.plasticSynapse?.energy,
        });
      }

      if (finalOutput) break;

      // Feed context back as next input and compute next activations
      currentInput = context;
      const activations = this.neuronLayer.forward(currentInput);
      const withPlastic = this.applyPlasticRecurrent(activations);
      pushBurstWeighted(withPlastic);
      this.rememberActivations(withPlastic);
      currentInput = Array.from(withPlastic.slice(0, c.inputDim));
    }

    // If never hit threshold, classify from last state
    if (!finalOutput) {
      const windowSz = this.history.size;
      const flatActs = this.history.toActivationMatrix();
      const actMatrix = flatToActMatrix(flatActs, c.numNeurons, windowSz);
      let syncMatrix = correlationMatrix(actMatrix);
      if (this.burstState) {
        syncMatrix = applyBurstWeightingToSyncMatrix(
          syncMatrix,
          this.burstState,
        );
      }
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

  /** Reset the model state (history buffer + burst state + plastic state). */
  reset(): void {
    this.history.clear();
    this.burstState?.reset();
    this.prevActivations = null;
    this.plasticSynapse?.reset();
  }

  /**
   * Apply the plastic recurrent pathway to base activations.
   * If no plastic synapse is configured, returns activations unchanged.
   * Also triggers the Hebbian weight update (Oja's rule).
   */
  private applyPlasticRecurrent(activations: Float64Array): Float64Array {
    if (!this.plasticSynapse || !this.prevActivations) {
      // First tick or no plasticity — just remember and pass through
      return activations;
    }

    // Apply recurrent pathway: activations + W_plastic @ prevActivations
    const result = this.plasticSynapse.apply(activations, this.prevActivations);

    // Update plastic weights via Oja's rule
    this.plasticSynapse.update(result, this.prevActivations);

    return result;
  }

  /** Remember activations for the next tick's plastic recurrent pathway. */
  private rememberActivations(activations: Float64Array): void {
    if (this.plasticSynapse) {
      this.prevActivations = new Float64Array(activations);
    }
  }

  /**
   * Total number of learnable parameters.
   * (NeuronLayer + SyncAttention weights + output head + plastic synapse)
   */
  get paramCount(): number {
    const c = this.config;
    const syncFlatDim = c.numNeurons * c.numNeurons;
    let count =
      this.neuronLayer.paramCount +
      syncFlatDim * c.numClasses +   // outputW
      c.numClasses;                  // outputB

    // Plastic synapse: N × N plastic weights (not learned via gradient,
    // but they are parameters in the model)
    if (this.plasticSynapse) {
      count += c.numNeurons * c.numNeurons;
    }

    return count;
  }

  /**
   * Get the current plastic synapse energy.
   * Useful for monitoring how much plasticity has accumulated.
   * Returns 0 if plasticity is not configured.
   */
  get plasticEnergy(): number {
    return this.plasticSynapse?.energy ?? 0;
  }

  /**
   * Consolidate accumulated plastic weights into the NeuronLayer's static
   * parameters. This is the CTM's "sleep consolidation" — transferring
   * short-term plastic changes into long-term weight storage.
   *
   * Strategy: distribute each neuron's total outgoing plastic weight
   * across its layer-0 input weights. After consolidation, the plastic
   * weight matrix is reset to near-zero, ready for fresh accumulation.
   *
   * This is a simplified Hebbian consolidation — in future phases,
   * a learned projection will bridge the N×N plastic matrix to the
   * N×(D×H+H+...) NeuronLayer parameter space.
   *
   * @returns The plastic energy that was consolidated (for logging)
   */
  consolidatePlasticity(): number {
    if (!this.plasticSynapse) return 0;

    const n = this.config.numNeurons;
    const energy = this.plasticSynapse.energy;
    const params = this.neuronLayer.getParams();

    // Compute per-neuron outgoing plastic magnitude
    const perNeuronInfluence: number[] = new Array(n).fill(0);
    const snapshot = this.plasticSynapse.snapshot();
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += Math.abs(snapshot[i][j]);
      }
      perNeuronInfluence[j] = sum;
    }

    // Normalize and scale for consolidation
    const maxInfluence = Math.max(...perNeuronInfluence, 1e-8);
    const consolidationStrength = 0.005; // small step per consolidation
    const perNeuron = params.length / n;

    for (let j = 0; j < n; j++) {
      const influence = perNeuronInfluence[j] / maxInfluence;
      const delta = influence * consolidationStrength;

      // Apply delta to a subset of this neuron's parameters
      const start = j * perNeuron;
      const end = start + Math.min(Math.floor(perNeuron * 0.3), params.length - start);
      for (let k = start; k < end; k++) {
        params[k] += delta * (Math.random() - 0.5) * 0.1;
      }
    }

    this.neuronLayer.setParams(params);
    this.plasticSynapse.reset();
    return energy;
  }
}

/**
 * Apply burst-weighting to a sync matrix [N × N].
 *
 * For each pair (i, j), if either neuron is bursting, boost the
 * correlation value. This makes co-bursting pairs carry more signal
 * in the sync matrix — the core insight that distinguishes sustained
 * co-activity from coincidental single-tick firing.
 */
function applyBurstWeightingToSyncMatrix(
  syncMatrix: number[][],
  burstState: BurstState,
  burstSyncBoost = 0.3,
): number[][] {
  const n = burstState.numNeurons;
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      let value = syncMatrix[i][j];
      if (burstState.isBursting(i) || burstState.isBursting(j)) {
        const boostI = burstState.isBursting(i)
          ? 1.0 - burstState.burstProgress(i) * (1.0 - burstState.config.burstDecay)
          : 0;
        const boostJ = burstState.isBursting(j)
          ? 1.0 - burstState.burstProgress(j) * (1.0 - burstState.config.burstDecay)
          : 0;
        const boost = 1.0 + burstSyncBoost * Math.max(boostI, boostJ);
        value = Math.min(1.0, value * boost);
      }
      row.push(Math.max(-1.0, Math.min(1.0, value))); // clamp to [-1, 1]
    }
    result.push(row);
  }
  return result;
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
