/**
 * Dendrite — Multi-Compartment Dendritic Spikes Module
 *
 * Phase 3 of the CTM architecture roadmap. Inspired by real neuroscience:
 * a single neuron is not a point — it has a branched dendritic tree where
 * local sub-threshold events (dendritic spikes) can occur independently
 * and vote at the soma.
 *
 * ## Biological Motivation
 *
 * In real neurons, dendrites are not passive cables. They contain voltage-gated
 * channels that can generate local spikes (calcium spikes, NMDA spikes) when
 * enough synchronous input arrives at a single dendritic branch. These local
 * spikes are all-or-nothing events that propagate to the soma, where they
 * summate. This gives a single neuron the computational power of a small
 * network — coincidence detection, logical operations, and input gating.
 *
 * ## Architectural Translation
 *
 * Each CTM neuron (index n) gets `numCompartments` independent dendritic
 * compartments. Each compartment:
 *
 * 1. **Sees a subset of input features** — a random binary mask selects
 *    which input dimensions feed this compartment. This biologically models
 *    the fact that synapses are physically distributed across the dendritic
 *    tree and different branches receive input from different presynaptic
 *    partners.
 *
 * 2. **Integrates locally** — the masked input is projected through a
 *    learned weight vector + bias, producing a compartment activation.
 *
 * 3. **Spikes or doesn't** — if the compartment activation exceeds a
 *    threshold, the compartment emits a spike (1.0). The spike is an
 *    all-or-nothing event — sub-threshold activation contributes nothing
 *    to the soma.
 *
 * 4. **Soma sums spikes** — the neuron's output activation is the count
 *    (or weighted sum) of its dendritic compartments that spiked this tick.
 *
 * ## Key Properties
 *
 * - **Sparsity by design**: Most compartments are silent most of the time.
 *   Only specific input patterns trigger a dendritic spike.
 * - **Coincidence detection**: A compartment spikes only when enough of
 *   *its* assigned features are simultaneously active. This is nonlinear
 *   feature binding at the sub-neuron level.
 * - **Compositional**: Since compartments have different input masks,
 *   different input patterns activate different combinations of compartments.
 *   The neuron learns which patterns matter.
 * - **Efficiency**: Dendritic spikes are binary — they don't require
 *   full-precision computation at inference time.
 *
 * ## Configuration
 *
 * ```
 * numNeurons     = 64       (N, set by CTM)
 * inputDim       = 32       (D, set by CTM)
 * numCompartments = 4       (C, compartments per neuron)
 * compartmentSize = 0.25    (fraction of input dims seen per compartment)
 * spikeThreshold  = 0.5     (compartment activation must exceed this to spike)
 * ```
 *
 * With N=64, D=32, C=4, compartmentSize=0.25:
 * - Each compartment sees 8 input dims
 * - Each compartment has 8 weights + 1 bias = 9 params
 * - Total: 64 × 4 × 9 = 2,304 params (vs. 64×(16×32+16+16+1)=33,344 for NeuronLayer)
 *
 * ## Integration
 *
 * Dendrite replaces NeuronLayer.forward() for the initial activation
 * computation. Instead of each neuron running a 2-layer MLP on the full
 * input, each neuron runs C compartment integrators on masked input,
 * then takes a majority/weighted vote. The rest of the CTM pipeline
 * (history, sync matrix, attention, adaptive ticks) is unchanged.
 *
 * For backward compatibility, Dendrite can be used alongside NeuronLayer
 * in a hybrid configuration: the neuron's activation is a combination of
 * its MLP output and its dendritic vote.
 */

// randn is defined locally (same pattern as neuron-layer.ts and ctm.ts)

export interface DendriteConfig {
  /** Number of compartments per neuron (C) */
  numCompartments: number;
  /** Fraction of input dimensions each compartment sees [0, 1] */
  compartmentSize: number;
  /** Activation threshold for compartment spike [0, ∞) */
  spikeThreshold: number;
  /**
   * Weighting mode for soma integration:
   * - "count": soma = number of spiking compartments (equal vote)
   * - "weighted": soma = weighted sum of spiking compartments (learned weights)
   * - "hybrid": soma = MLP_output + dendritic_vote (requires neuronLayer)
   */
  somaMode: "count" | "weighted" | "hybrid";
}

export const DEFAULT_DENDRITE_CONFIG: DendriteConfig = {
  numCompartments: 4,
  compartmentSize: 0.25,
  spikeThreshold: 0.5,
  somaMode: "count",
};

/**
 * DendriticCompartment — a single branch of one neuron's dendritic tree.
 *
 * Learns which input features to care about and what pattern to detect.
 */
export class DendriticCompartment {
  /** Weight vector (length = number of assigned input dims) */
  readonly weights: Float64Array;
  /** Bias scalar */
  bias: number;
  /** Indices of input dimensions this compartment sees */
  readonly inputIndices: number[];
  /** Running spike rate tracker for monitoring */
  spikeCount: number = 0;
  totalForwardCalls: number = 0;

  constructor(
    inputDim: number,
    compartmentSize: number,
    rng: () => number,
  ) {
    const numInputs = Math.max(1, Math.floor(inputDim * compartmentSize));

    // Assign random input indices (without replacement for this compartment)
    // Different compartments within the same neuron will naturally overlap
    // because each draws independently. This is biologically realistic —
    // dendritic branches can share presynaptic partners.
    this.inputIndices = [];
    const pool = Array.from({ length: inputDim }, (_, i) => i);
    for (let i = 0; i < numInputs; i++) {
      const picked = Math.floor(rng() * pool.length);
      this.inputIndices.push(pool[picked]);
      pool[picked] = pool[pool.length - 1];
      pool.pop();
    }

    // Initialize weights: small random, centered at 0
    const scale = Math.sqrt(2.0 / numInputs);
    this.weights = new Float64Array(numInputs);
    for (let i = 0; i < numInputs; i++) {
      this.weights[i] = randn(rng) * scale;
    }

    this.bias = randn(rng) * 0.01;
  }

  /**
   * Forward: integrate and decide whether to spike.
   *
   * @param input — full input vector (length inputDim)
   * @returns spike value: 1.0 if activation > threshold, 0.0 otherwise
   */
  forward(input: ArrayLike<number>): number {
    this.totalForwardCalls++;
    let activation = this.bias;
    for (let i = 0; i < this.inputIndices.length; i++) {
      activation += this.weights[i] * input[this.inputIndices[i]];
    }

    // All-or-nothing spike
    if (activation > 0) {
      // ReLU-like but spiking: any positive drive can spike if strong enough
      // The sigmoid gives a soft threshold for gradient-based learning
      const spikeProb = 1.0 / (1.0 + Math.exp(-(activation - 0.5)));
      if (spikeProb > 0.5) {
        this.spikeCount++;
        return 1.0;
      }
    }
    return 0.0;
  }

  /** Get number of assigned input dimensions. */
  get numInputs(): number {
    return this.inputIndices.length;
  }

  /** Spike rate since last reset. */
  get spikeRate(): number {
    return this.totalForwardCalls > 0
      ? this.spikeCount / this.totalForwardCalls
      : 0;
  }

  resetStats(): void {
    this.spikeCount = 0;
    this.totalForwardCalls = 0;
  }

  /** Serialize parameters for this compartment. */
  getParams(): Float64Array {
    const out = new Float64Array(this.weights.length + 2);
    let idx = 0;
    for (let i = 0; i < this.weights.length; i++) {
      out[idx++] = this.weights[i];
    }
    out[idx++] = this.bias;
    out[idx++] = this.inputIndices.length;
    return out;
  }
}

/**
 * DendriteNeuron — one neuron with C dendritic compartments.
 *
 * The neuron's output is determined by how many of its compartments spike.
 * This replaces the per-neuron 2-layer MLP from NeuronLayer.
 */
export class DendriteNeuron {
  readonly compartments: DendriticCompartment[];
  readonly numCompartments: number;
  readonly somaMode: "count" | "weighted" | "hybrid";
  /** Soma weights for "weighted" mode (one per compartment) */
  readonly somaWeights: Float64Array;
  /** Soma bias for "weighted" mode */
  somaBias: number;

  constructor(
    inputDim: number,
    config: DendriteConfig,
    rng: () => number,
  ) {
    this.numCompartments = config.numCompartments;
    this.somaMode = config.somaMode;

    this.compartments = [];
    for (let c = 0; c < config.numCompartments; c++) {
      this.compartments.push(
        new DendriticCompartment(inputDim, config.compartmentSize, rng),
      );
    }

    // Soma weights for weighted mode
    this.somaWeights = new Float64Array(config.numCompartments);
    for (let c = 0; c < config.numCompartments; c++) {
      this.somaWeights[c] = randn(rng) * 0.1;
    }
    this.somaBias = randn(rng) * 0.01;
  }

  /**
   * Forward: run all compartments, compute soma output.
   *
   * @param input — full input vector (length inputDim)
   * @param mlpOutput — NeuronLayer's output for this neuron (used in "hybrid" mode)
   * @returns — soma activation value
   */
  forward(input: ArrayLike<number>, mlpOutput: number = 0): number {
    const spikes = new Float64Array(this.numCompartments);
    for (let c = 0; c < this.numCompartments; c++) {
      spikes[c] = this.compartments[c].forward(input);
    }

    switch (this.somaMode) {
      case "count": {
        // Simple majority: how many compartments spiked, normalized to [0, 1]
        let count = 0;
        for (let c = 0; c < this.numCompartments; c++) {
          count += spikes[c];
        }
        return count / this.numCompartments;
      }
      case "weighted": {
        // Weighted vote: some compartments matter more than others
        let sum = this.somaBias;
        for (let c = 0; c < this.numCompartments; c++) {
          sum += this.somaWeights[c] * spikes[c];
        }
        // Keep in reasonable range via tanh
        return Math.tanh(sum);
      }
      case "hybrid": {
        // MLP baseline + dendritic modulation
        const dendriticContribution = this.somaBias;
        let count = 0;
        for (let c = 0; c < this.numCompartments; c++) {
          if (spikes[c] > 0) count++;
        }
        // Dendritic contribution scales with how many compartments spiked
        const dendriteModulation = count > 0
          ? count / this.numCompartments
          : 0;
        return mlpOutput * (1 + 0.3 * dendriteModulation) + dendriticContribution;
      }
    }
  }

  /** Reset spike statistics for monitoring. */
  resetStats(): void {
    for (const c of this.compartments) {
      c.resetStats();
    }
  }

  /** Average spike rate across compartments. */
  get avgSpikeRate(): number {
    if (this.compartments.length === 0) return 0;
    let sum = 0;
    for (const c of this.compartments) {
      sum += c.spikeRate;
    }
    return sum / this.compartments.length;
  }
}

/**
 * DendriteLayer — A layer of N dendrite-equipped neurons.
 *
 * This is the drop-in replacement for NeuronLayer.forward().
 * It maintains an array of DendriteNeuron instances and processes
 * input in parallel (sequentially in the TypeScript reference impl;
 * vectorized in a future GPU version).
 */
export class DendriteLayer {
  readonly neurons: DendriteNeuron[];
  readonly numNeurons: number;
  readonly config: DendriteConfig;

  constructor(
    numNeurons: number,
    inputDim: number,
    config: Partial<DendriteConfig> = {},
    rng: () => number = Math.random,
  ) {
    this.config = { ...DEFAULT_DENDRITE_CONFIG, ...config };
    this.numNeurons = numNeurons;
    this.neurons = [];

    for (let n = 0; n < numNeurons; n++) {
      this.neurons.push(
        new DendriteNeuron(inputDim, this.config, rng),
      );
    }
  }

  /**
   * Forward pass for a single timestep.
   *
   * @param input — input embedding vector (length inputDim), shared across all neurons
   * @returns — activation vector (length numNeurons)
   */
  forward(input: ArrayLike<number>): Float64Array {
    const out = new Float64Array(this.numNeurons);
    for (let n = 0; n < this.numNeurons; n++) {
      out[n] = this.neurons[n].forward(input);
    }
    return out;
  }

  /**
   * Forward pass with MLP outputs for hybrid mode.
   *
   * @param input — input embedding vector
   * @param mlpOutputs — NeuronLayer.forward() outputs for each neuron
   * @returns — activation vector (length numNeurons)
   */
  forwardHybrid(
    input: ArrayLike<number>,
    mlpOutputs: Float64Array,
  ): Float64Array {
    const out = new Float64Array(this.numNeurons);
    for (let n = 0; n < this.numNeurons; n++) {
      out[n] = this.neurons[n].forward(input, mlpOutputs[n]);
    }
    return out;
  }

  /** Reset spike statistics for all neurons. */
  resetStats(): void {
    for (const n of this.neurons) {
      n.resetStats();
    }
  }

  /** Average spike rate across all neurons. */
  get avgSpikeRate(): number {
    if (this.neurons.length === 0) return 0;
    let sum = 0;
    for (const n of this.neurons) {
      sum += n.avgSpikeRate;
    }
    return sum / this.neurons.length;
  }

  /** Total number of learnable parameters across all neurons. */
  get paramCount(): number {
    let count = 0;
    for (const neuron of this.neurons) {
      for (const comp of neuron.compartments) {
        // weights + bias + stored inputIndices length
        count += comp.numInputs + 2;
      }
      // soma weights + soma bias
      count += neuron.somaWeights.length + 1;
    }
    return count;
  }
}

/** Box-Muller transform for Gaussian initialization. */
function randn(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
