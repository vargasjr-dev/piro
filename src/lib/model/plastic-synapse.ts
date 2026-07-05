/**
 * PlasticSynapse — Hebbian Plastic Recurrent Weight Matrix
 *
 * In neuroscience, Hebbian plasticity is the mechanism by which synapses
 * strengthen or weaken based on the correlated activity of pre- and post-
 * synaptic neurons. "Neurons that fire together, wire together."
 *
 * This module implements a **plastic recurrent weight matrix** W_plastic[N × N]
 * that connects each neuron to every other neuron. Unlike the static weights
 * in NeuronLayer (learned via gradient descent), these weights update via
 * a local, unsupervised Hebbian rule during the forward pass itself.
 *
 * ## Update Rule: Oja's Rule
 *
 * The classic Hebbian rule `Δw_ij = η * a_i * a_j` is unstable — weights
 * grow without bound. Oja's rule adds a stabilizing term:
 *
 * ```
 * Δw_ij = η * (a_i * a_j - w_ij * a_i²)
 * ```
 *
 * Where:
 *   - a_i = activation of post-synaptic neuron i (this tick)
 *   - a_j = activation of pre-synaptic neuron j (previous tick)
 *   - w_ij = current plastic weight from j → i
 *   - η = learning rate
 *
 * The `- w_ij * a_i²` term keeps weights normalized, preventing unbounded
 * growth while preserving the Hebbian direction. Weights naturally converge
 * toward the principal component of the input distribution.
 *
 * ## Recurrent Pathway in CTM
 *
 * During the adaptive-tick loop, each tick's activation includes a recurrent
 * contribution via the plastic matrix:
 *
 * ```
 * base_activation = NeuronLayer.forward(current_input)
 * recurrent_input = W_plastic @ previous_activations
 * final_activation = base_activation + recurrent_input (clipped)
 * ```
 *
 * This means the plastic weights create a **short-term attractor dynamics**:
 * patterns that have been seen before are "remembered" and reinforced.
 *
 * ## Integration
 *
 * - PlasticSynapse is bundled into CTM (constructed when plasticConfig is provided)
 * - Updated via Oja's rule after each tick in the adaptive loop
 * - Persists across forward calls (memory accumulates)
 * - Reset via `reset()` for clean state
 */

export interface PlasticConfig {
  /** Hebbian learning rate (typical: 0.001–0.05) */
  learningRate: number;
  /**
   * Weight decay per update (L2 regularization on plastic weights).
   * 0 = no decay. Small values (0.0001–0.01) prevent drift.
   */
  weightDecay: number;
  /**
   * Whether to apply the plastic recurrent pathway during the warm-up phase.
   * false (default) = warm-up builds baseline without plastic influence.
   * For most use-cases, keeping this false is better — warm-up fills the
   * history window, and plastic dynamics begin during the adaptive loop.
   */
  warmupPlastic: boolean;
  /**
   * Clamp plastic weight values to [-maxWeight, maxWeight].
   * Prevents any single synapse from dominating (typical: 0.5–2.0).
   */
  maxWeight: number;
  /**
   * How many ticks to skip plastic updates at the start of the adaptive loop.
   * This lets the sync matrix stabilize before plastic weights start changing.
   * (default: 1)
   */
  warmupTicks: number;
}

export const DEFAULT_PLASTIC_CONFIG: PlasticConfig = {
  learningRate: 0.01,
  weightDecay: 0.001,
  warmupPlastic: false,
  maxWeight: 1.0,
  warmupTicks: 1,
};

/**
 * PlasticSynapse — N×N plastic recurrent weight matrix with Oja's rule.
 *
 * The matrix W_plastic[i][j] represents the recurrent connection from
 * neuron j → neuron i. Updated via Hebbian (Oja) plasticity after each tick.
 */
export class PlasticSynapse {
  readonly config: PlasticConfig;
  readonly numNeurons: number;

  /** N×N plastic weight matrix */
  readonly weights: Float64Array[];

  /** Tick counter for warmup tracking */
  private ticksSinceReset: number = 0;

  constructor(config: Partial<PlasticConfig> = {}, numNeurons: number) {
    this.config = { ...DEFAULT_PLASTIC_CONFIG, ...config };
    this.numNeurons = numNeurons;

    // Initialize to small random values — near-zero so initial plastic
    // contribution is negligible (the CTM starts from its static weights)
    this.weights = [];
    const scale = 0.01;
    for (let i = 0; i < numNeurons; i++) {
      const row = new Float64Array(numNeurons);
      for (let j = 0; j < numNeurons; j++) {
        row[j] = (Math.random() * 2 - 1) * scale;
      }
      this.weights.push(row);
    }
  }

  /**
   * Apply the plastic recurrent connection to a set of activations.
   *
   * Computes: output = activations + W_plastic @ previous_activations
   * where W_plastic[i] is the incoming recurrent weights for neuron i.
   *
   * @param activations — Current tick's base activations (length N)
   * @param previousActivations — Previous tick's activations (length N)
   * @returns — Modified activations with recurrent contribution
   */
  apply(
    activations: Float64Array | number[],
    previousActivations: Float64Array | number[],
  ): Float64Array {
    const n = this.numNeurons;
    const result = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      let recurrent = 0;
      const row = this.weights[i];
      for (let j = 0; j < n; j++) {
        recurrent += row[j] * previousActivations[j];
      }
      // Clamp to [-maxWeight, maxWeight] to prevent blowup
      result[i] = Math.max(
        -this.config.maxWeight,
        Math.min(this.config.maxWeight, activations[i] + recurrent),
      );
    }

    return result;
  }

  /**
   * Apply Oja's Hebbian rule to update the plastic weight matrix.
   *
   * Δw_ij = η * (a_i * prev_a_j - w_ij * a_i²) - λ * w_ij
   *
   * Where:
   *   a_i = post-synaptic activation (current tick)
   *   prev_a_j = pre-synaptic activation (previous tick)
   *   η = learning rate
   *   λ = weight decay
   *
   * @param activations — Current tick's post-plastic activations (length N)
   * @param previousActivations — Previous tick's pre-plastic activations (length N)
   */
  update(
    activations: Float64Array | number[],
    previousActivations: Float64Array | number[],
  ): void {
    this.ticksSinceReset++;
    if (this.ticksSinceReset <= this.config.warmupTicks) return;

    const n = this.numNeurons;
    const η = this.config.learningRate;
    const λ = this.config.weightDecay;

    for (let i = 0; i < n; i++) {
      const a_i = activations[i];
      const row = this.weights[i];

      for (let j = 0; j < n; j++) {
        const prev_a_j = previousActivations[j];
        const w_ij = row[j];

        // Oja's rule: η * (a_i * prev_a_j - w_ij * a_i²)
        const hebbian = a_i * prev_a_j;
        const ojaNorm = w_ij * a_i * a_i;
        const delta = η * (hebbian - ojaNorm);

        // Weight decay
        const decay = λ * w_ij;

        row[j] = Math.max(
          -this.config.maxWeight,
          Math.min(this.config.maxWeight, w_ij + delta - decay),
        );
      }
    }
  }

  /**
   * Get the total energy of the plastic weight matrix.
   * Useful for monitoring plasticity saturation.
   */
  get energy(): number {
    let sumSq = 0;
    for (let i = 0; i < this.numNeurons; i++) {
      const row = this.weights[i];
      for (let j = 0; j < this.numNeurons; j++) {
        sumSq += row[j] * row[j];
      }
    }
    return Math.sqrt(sumSq);
  }

  /** Reset all plastic weights to near-zero and reset tick counter. */
  reset(): void {
    this.ticksSinceReset = 0;
    const scale = 0.01;
    for (let i = 0; i < this.numNeurons; i++) {
      const row = this.weights[i];
      for (let j = 0; j < this.numNeurons; j++) {
        row[j] = (Math.random() * 2 - 1) * scale;
      }
    }
  }

  /**
   * Consolidate plastic weights into a set of base-weight deltas.
   *
   * Returns a matrix of the same shape as the plastic weights, representing
   * the accumulated plasticity. This can be used to:
   * 1. Apply to NeuronLayer weights for long-term consolidation
   * 2. Save as a plasticity checkpoint
   * 3. Zero out the plastic matrix after consolidation
   *
   * @returns Deep copy of current plastic weight matrix as number[][]
   */
  snapshot(): number[][] {
    const n = this.numNeurons;
    const snap: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        row.push(this.weights[i][j]);
      }
      snap.push(row);
    }
    return snap;
  }
}
