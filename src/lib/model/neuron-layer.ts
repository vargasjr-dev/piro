/**
 * NeuronLayer — N independent single-neuron MLPs
 *
 * In the CTM architecture, each neuron has its own tiny 2-layer MLP
 * (learned weights + bias) rather than sharing parameters across neurons.
 * Each MLP reads the same input embedding and produces that neuron's
 * next activation value.
 *
 * This is biologically-inspired: real neurons don't share weights.
 * It also means the model can specialize — different neurons learn to
 * detect different features in the input without interference.
 *
 * ```
 * input (embedDim) → [W_n[0] · input + b_n[0]] → ReLU → [W_n[1] · hidden + b_n[1]] → activation_n
 * ```
 *
 * For N neurons with hidden size H and input dimension D:
 * - Layer 0 weights:      N × H × D  (per-neuron input→hidden)
 * - Layer 0 biases:       N × H      (per-neuron hidden bias)
 * - Layer 1 weights:      N × 1 × H  (per-neuron hidden→output)
 * - Layer 1 biases:       N × 1      (per-neuron output bias)
 * - Total parameters:     N × (H×D + H + H + 1) = N × (H(D + 1) + H + 1)
 */

import { matVec, relu, sigmoid } from "./linalg";

export type ActivationFn = "relu" | "sigmoid" | "tanh";

export class NeuronLayer {
  readonly numNeurons: number;
  readonly inputDim: number;
  readonly hiddenDim: number;
  readonly activation: ActivationFn;

  // Layer-0 weights: [neuron][hidden][input]
  private w0: Float64Array[][];
  // Layer-0 biases:  [neuron][hidden]
  private b0: Float64Array[];
  // Layer-1 weights: [neuron][1][hidden]
  private w1: Float64Array[][];
  // Layer-1 biases:  [neuron] (scalar)
  private b1: Float64Array;

  private rng: () => number;

  constructor(
    numNeurons: number,
    inputDim: number,
    hiddenDim: number,
    activation: ActivationFn = "relu",
    rng: () => number = Math.random,
  ) {
    if (numNeurons < 1) throw new RangeError("numNeurons must be >= 1");
    if (inputDim < 1) throw new RangeError("inputDim must be >= 1");
    if (hiddenDim < 1) throw new RangeError("hiddenDim must be >= 1");

    this.numNeurons = numNeurons;
    this.inputDim = inputDim;
    this.hiddenDim = hiddenDim;
    this.activation = activation;
    this.rng = rng;

    // Xavier initialization scale
    const scale0 = Math.sqrt(2.0 / (inputDim + hiddenDim));
    const scale1 = Math.sqrt(2.0 / (hiddenDim + 1));

    this.w0 = [];
    this.b0 = [];
    this.w1 = [];
    this.b1 = new Float64Array(numNeurons);

    for (let n = 0; n < numNeurons; n++) {
      // Layer 0: [hiddenDim × inputDim]
      const w0n: Float64Array[] = [];
      for (let h = 0; h < hiddenDim; h++) {
        const row = new Float64Array(inputDim);
        for (let d = 0; d < inputDim; d++) {
          row[d] = randn(this.rng) * scale0;
        }
        w0n.push(row);
      }
      this.w0.push(w0n);

      // Layer 0 bias
      const b0n = new Float64Array(hiddenDim);
      for (let h = 0; h < hiddenDim; h++) {
        b0n[h] = randn(this.rng) * 0.01;
      }
      this.b0.push(b0n);

      // Layer 1: [1 × hiddenDim]
      const w1n: Float64Array[] = [];
      const row = new Float64Array(hiddenDim);
      for (let h = 0; h < hiddenDim; h++) {
        row[h] = randn(this.rng) * scale1;
      }
      w1n.push(row);
      this.w1.push(w1n);

      // Layer 1 bias (scalar)
      this.b1[n] = randn(this.rng) * 0.01;
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
      // Hidden: W0·input + b0
      const hidden = new Float64Array(this.hiddenDim);
      for (let h = 0; h < this.hiddenDim; h++) {
        let sum = this.b0[n][h];
        const row = this.w0[n][h];
        for (let d = 0; d < this.inputDim; d++) {
          sum += row[d] * input[d];
        }
        hidden[h] = this.applyActivation(sum);
      }

      // Output: W1·hidden + b1
      let outVal = this.b1[n];
      const w1row = this.w1[n][0];
      for (let h = 0; h < this.hiddenDim; h++) {
        outVal += w1row[h] * hidden[h];
      }
      out[n] = outVal;
    }

    return out;
  }

  /** Apply the chosen activation function. */
  private applyActivation(x: number): number {
    switch (this.activation) {
      case "relu":
        return relu(x);
      case "sigmoid":
        return sigmoid(x);
      case "tanh":
        return Math.tanh(x);
    }
  }

  /** Total number of learnable parameters. */
  get paramCount(): number {
    return this.numNeurons * (
      this.hiddenDim * this.inputDim +  // w0
      this.hiddenDim +                   // b0
      this.hiddenDim +                   // w1
      1                                  // b1
    );
  }

  /** Serialize parameters to a flat Float64Array (for saving/loading). */
  getParams(): Float64Array {
    const out = new Float64Array(this.paramCount);
    let idx = 0;
    for (let n = 0; n < this.numNeurons; n++) {
      for (let h = 0; h < this.hiddenDim; h++) {
        for (let d = 0; d < this.inputDim; d++) {
          out[idx++] = this.w0[n][h][d];
        }
      }
      for (let h = 0; h < this.hiddenDim; h++) {
        out[idx++] = this.b0[n][h];
      }
      for (let h = 0; h < this.hiddenDim; h++) {
        out[idx++] = this.w1[n][0][h];
      }
      out[idx++] = this.b1[n];
    }
    return out;
  }

  /** Load parameters from a flat Float64Array (matches getParams layout). */
  setParams(params: Float64Array): void {
    if (params.length !== this.paramCount) {
      throw new RangeError(
        `expected ${this.paramCount} params, got ${params.length}`
      );
    }
    let idx = 0;
    for (let n = 0; n < this.numNeurons; n++) {
      for (let h = 0; h < this.hiddenDim; h++) {
        for (let d = 0; d < this.inputDim; d++) {
          this.w0[n][h][d] = params[idx++];
        }
      }
      for (let h = 0; h < this.hiddenDim; h++) {
        this.b0[n][h] = params[idx++];
      }
      for (let h = 0; h < this.hiddenDim; h++) {
        this.w1[n][0][h] = params[idx++];
      }
      this.b1[n] = params[idx++];
    }
  }
}

/** Box-Muller transform for Xavier/Gaussian initialization. */
function randn(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
