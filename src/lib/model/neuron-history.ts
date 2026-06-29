/**
 * NeuronHistory — rolling window of neuron activations
 *
 * Maintains a fixed-width rolling buffer of activation values per neuron.
 * Used by the CTM architecture to compute the synchronization matrix via
 * correlationMatrix() over the most recent W timesteps.
 *
 * ```
 * Neurons:        [n0  n1  n2  ...  nN-1]
 * t=0:            [a0  a1  a2  ...  aN-1]  ← oldest
 * t=1:            [a0  a1  a2  ...  aN-1]
 * ...
 * t=W-1:          [a0  a1  a2  ...  aN-1]  ← newest
 * ```
 *
 * Each push advances the rolling window, dropping the oldest timestep.
 * The current buffer can be extracted as an [N × W] matrix for correlation
 * analysis.
 */

const MAX_NEURONS = 4096;
const MAX_WINDOW = 1024;

export class NeuronHistory {
  private buffer: Float64Array;
  readonly numNeurons: number;
  readonly windowSize: number;
  private writeIdx: number = 0;
  private filled: boolean = false;

  /**
   * @param numNeurons  N — number of neurons tracked
   * @param windowSize  W — number of past timesteps to remember
   */
  constructor(numNeurons: number, windowSize: number) {
    if (numNeurons < 1 || numNeurons > MAX_NEURONS) {
      throw new RangeError(
        `numNeurons must be 1–${MAX_NEURONS}, got ${numNeurons}`
      );
    }
    if (windowSize < 2 || windowSize > MAX_WINDOW) {
      throw new RangeError(
        `windowSize must be 2–${MAX_WINDOW}, got ${windowSize}`
      );
    }
    this.numNeurons = numNeurons;
    this.windowSize = windowSize;
    // flat [W × N] buffer — row-major: [timestep][neuron]
    this.buffer = new Float64Array(windowSize * numNeurons);
  }

  /** Push the latest activation vector (length N) into the rolling window. */
  push(activations: ArrayLike<number>): void {
    if (activations.length !== this.numNeurons) {
      throw new RangeError(
        `expected ${this.numNeurons} activations, got ${activations.length}`
      );
    }
    const offset = this.writeIdx * this.numNeurons;
    for (let i = 0; i < this.numNeurons; i++) {
      this.buffer[offset + i] = activations[i];
    }
    this.writeIdx = (this.writeIdx + 1) % this.windowSize;
    if (this.writeIdx === 0) this.filled = true;
  }

  /** True once the window has been filled at least once. */
  get isWarm(): boolean {
    return this.filled;
  }

  /** Number of timesteps currently stored (W once warm, writeIdx before). */
  get size(): number {
    return this.filled ? this.windowSize : this.writeIdx;
  }

  /**
   * Extract the full activation matrix as an [N × size] flat Float64Array
   * in column-major order (neuron-major) — ready for correlationMatrix().
   *
   * Returns a flattened [N × size] array where:
   *   matrix[n][t] = result[n * size + t]
   *
   * i.e. each neuron's activation sequence is contiguous.
   */
  toActivationMatrix(): Float64Array {
    const t = this.size;
    const out = new Float64Array(this.numNeurons * t);

    if (this.filled) {
      // Clockwise read: the logical oldest row is at writeIdx
      for (let row = 0; row < t; row++) {
        const srcOffset = ((this.writeIdx + row) % t) * this.numNeurons;
        for (let n = 0; n < this.numNeurons; n++) {
          out[n * t + row] = this.buffer[srcOffset + n];
        }
      }
    } else {
      // Not yet wrapped — linear from index 0
      for (let row = 0; row < t; row++) {
        const srcOffset = row * this.numNeurons;
        for (let n = 0; n < this.numNeurons; n++) {
          out[n * t + row] = this.buffer[srcOffset + n];
        }
      }
    }
    return out;
  }

  /** Get the most recent activation vector (length N). */
  getLatest(): Float64Array {
    const idx = this.writeIdx === 0
      ? this.windowSize - 1
      : this.writeIdx - 1;
    const offset = idx * this.numNeurons;
    return this.buffer.slice(offset, offset + this.numNeurons);
  }

  /** Reset the buffer to empty. */
  clear(): void {
    this.buffer.fill(0);
    this.writeIdx = 0;
    this.filled = false;
  }
}
