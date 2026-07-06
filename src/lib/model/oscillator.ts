/**
 * OscillatorBank — Kuramoto-style coupled oscillators for Phase 4
 *
 * Each neuron has an intrinsic oscillator that produces a phase θ,
 * which gates the neuron's excitability via g(t) = (sin(θ) + 1) / 2.
 * Oscillators couple through the classic Kuramoto phase interaction,
 * allowing spontaneous synchronization and transient assembly formation.
 *
 * ## Equations
 *
 *   dθᵢ/dt = ωᵢ + I(t) + Σⱼ W[i][j]·sin(θⱼ - θᵢ)
 *          ↑         ↑         ↑
 *     intrinsic   input     coupling (Kuramoto)
 *     frequency   current
 *
 * ## Usage
 *
 * ```ts
 * const bank = new OscillatorBank({
 *   couplingStrength: 0.05,
 * }, numNeurons);
 *
 * for (let tick = 0; tick < T; tick++) {
 *   bank.step(inputCurrents, dt);
 *   const gates = bank.getGates();
 *   // activations *= gates
 * }
 * ```
 *
 * All buffers are Float64Array for SIMD-friendly numeric performance.
 */

export interface OscillatorConfig {
  /**
   * Per-neuron intrinsic frequencies in rad/tick.
   * If undefined, frequencies are initialised uniformly in [0.5, 2.0].
   * Length must match numNeurons if provided.
   */
  frequencies?: number[];
  /**
   * Uniform coupling strength κ used when W_couple is identity-scaled.
   * If a coupling matrix is provided via setCouplingMatrix(), this is ignored.
   * (default 0.05)
   */
  couplingStrength?: number;
  /** Optional fixed coupling matrix [N×N]. Mutually exclusive with couplingStrength. */
  couplingMatrix?: Float64Array;
}

export class OscillatorBank {
  /** Per-neuron phase θ in [0, 2π) */
  private phases: Float64Array;
  /** Per-neuron intrinsic frequencies ω (rad/tick) */
  private frequencies: Float64Array;
  /** Number of neurons N */
  private readonly N: number;
  /**
   * Coupling matrix W_couple [N×N] stored row-major.
   * Initialised as (κ/N) for all off-diagonal pairs unless a custom matrix is provided.
   */
  private coupling: Float64Array;
  /** Pre-allocated scratch buffer for intermediate computations */
  private scratch: Float64Array;

  constructor(config: OscillatorConfig, numNeurons: number) {
    this.N = numNeurons;

    // Initialise phases randomly in [0, 2π)
    this.phases = new Float64Array(numNeurons);
    for (let i = 0; i < numNeurons; i++) {
      this.phases[i] = Math.random() * 2 * Math.PI;
    }

    // Frequencies
    this.frequencies = new Float64Array(numNeurons);
    if (config.frequencies) {
      if (config.frequencies.length !== numNeurons) {
        throw new Error(
          `OscillatorBank: frequencies length ${config.frequencies.length} ` +
            `does not match numNeurons ${numNeurons}`,
        );
      }
      this.frequencies.set(config.frequencies);
    } else {
      // Default: uniform random in [0.5, 2.0] rad/tick
      for (let i = 0; i < numNeurons; i++) {
        this.frequencies[i] = 0.5 + Math.random() * 1.5;
      }
    }

    // Coupling matrix
    this.coupling = new Float64Array(numNeurons * numNeurons);
    if (config.couplingMatrix) {
      if (config.couplingMatrix.length !== numNeurons * numNeurons) {
        throw new Error(
          `OscillatorBank: couplingMatrix length ${config.couplingMatrix.length} ` +
            `does not match N² ${numNeurons * numNeurons}`,
        );
      }
      this.coupling.set(config.couplingMatrix);
    } else {
      const κ = config.couplingStrength ?? 0.05;
      const scale = κ / numNeurons;
      // Initialise all couplings uniformly at κ/N.
      // In the classic Kuramoto model, this gives every pair a symmetric
      // coupling that drives synchronization. Over time, learnCoupling()
      // can sculpt this into a structured connectivity matrix.
      for (let i = 0; i < numNeurons; i++) {
        const rowOffset = i * numNeurons;
        for (let j = 0; j < numNeurons; j++) {
          this.coupling[rowOffset + j] = i === j ? 0 : scale;
        }
      }
    }

    this.scratch = new Float64Array(numNeurons);
  }

  /**
   * Advance all oscillators one step via forward Euler integration.
   *
   *   dθᵢ/dt = ωᵢ + I(t)ᵢ + Σⱼ W[i][j]·sin(θⱼ - θᵢ)
   *
   * @param inputCurrents — external driving current per neuron [N]
   * @param dt — time step size (default 0.1)
   */
  step(inputCurrents?: Float64Array, dt: number = 0.1): void {
    const N = this.N;
    const phases = this.phases;
    const frequencies = this.frequencies;
    const coupling = this.coupling;
    const scratch = this.scratch;

    // Compute Kuramoto coupling term for each neuron
    //   Σⱼ W[i][j] · sin(θⱼ - θᵢ)
    for (let i = 0; i < N; i++) {
      let sum = 0;
      const rowOffset = i * N;
      for (let j = 0; j < N; j++) {
        sum += coupling[rowOffset + j] * Math.sin(phases[j] - phases[i]);
      }
      scratch[i] = sum;
    }

    // Forward Euler: θᵢ += dθᵢ/dt · dt
    for (let i = 0; i < N; i++) {
      const ω = frequencies[i];
      const I_t = inputCurrents?.[i] ?? 0;
      const dθ = ω + I_t + scratch[i];

      phases[i] += dθ * dt;

      // Wrap phase to [0, 2π)
      phases[i] = phases[i] % (2 * Math.PI);
      if (phases[i] < 0) phases[i] += 2 * Math.PI;
    }
  }

  /**
   * Get current gating signals g(t) = (sin(θ) + 1) / 2 ∈ [0, 1].
   * A neuron near its preferred phase (θ ≈ π/2) fires more easily (g ≈ 1);
   * near its trough (θ ≈ 3π/2) it is effectively silent (g ≈ 0).
   */
  getGates(): Float64Array {
    const gates = new Float64Array(this.N);
    for (let i = 0; i < this.N; i++) {
      gates[i] = (Math.sin(this.phases[i]) + 1) / 2;
    }
    return gates;
  }

  /** Get current phases [0, 2π) for each neuron (returns a copy). */
  getPhases(): Float64Array {
    return new Float64Array(this.phases);
  }

  /**
   * Compute synchrony index R ∈ [0, 1].
   *
   * R = |(1/N) · Σⱼ exp(i·θⱼ)|
   *
   * R = 0 means uniformly random phases (asynchrony).
   * R = 1 means all phases identical (perfect synchrony).
   */
  synchronyIndex(): number {
    let sumRe = 0;
    let sumIm = 0;
    for (let i = 0; i < this.N; i++) {
      sumRe += Math.cos(this.phases[i]);
      sumIm += Math.sin(this.phases[i]);
    }
    const meanRe = sumRe / this.N;
    const meanIm = sumIm / this.N;
    return Math.sqrt(meanRe * meanRe + meanIm * meanIm);
  }

  /**
   * Update the coupling matrix using a Hebbian/Oja-style rule.
   *
   * ΔW[i][j] = η · sin(θⱼ - θᵢ) - α · W[i][j]
   *
   * The sin(θⱼ - θᵢ) term strengthens coupling between neurons that
   * fire in a consistent phase relationship (like spike-timing-dependent
   * plasticity). The -α·W term provides decay to prevent runaway growth.
   *
   * @param learningRate — plasticity learning rate η (default 0.01)
   * @param decay — weight decay α (default 0.001)
   */
  learnCoupling(learningRate: number = 0.01, decay: number = 0.001): void {
    const N = this.N;
    const phases = this.phases;
    const coupling = this.coupling;

    for (let i = 0; i < N; i++) {
      const rowOffset = i * N;
      for (let j = 0; j < N; j++) {
        if (i === j) continue; // skip self-coupling
        const phaseDiff = phases[j] - phases[i];
        const hebbianDelta = Math.sin(phaseDiff);
        const idx = rowOffset + j;
        coupling[idx] += learningRate * hebbianDelta - decay * coupling[idx];
        // Clamp to prevent runaway
        coupling[idx] = Math.max(-1, Math.min(1, coupling[idx]));
      }
    }
  }

  /**
   * Replace the coupling matrix entirely.
   * Useful for loading learned weights.
   */
  setCouplingMatrix(matrix: Float64Array): void {
    if (matrix.length !== this.N * this.N) {
      throw new Error(
        `OscillatorBank: coupling matrix length ${matrix.length} ` +
          `does not match N² ${this.N * this.N}`,
      );
    }
    this.coupling.set(matrix);
  }

  /** Get a copy of the current coupling matrix. */
  getCouplingMatrix(): Float64Array {
    return new Float64Array(this.coupling);
  }

  /** Get per-neuron frequencies (a copy). */
  getFrequencies(): Float64Array {
    return new Float64Array(this.frequencies);
  }

  /** Set per-neuron frequencies (must match N). */
  setFrequencies(freqs: Float64Array): void {
    if (freqs.length !== this.N) {
      throw new Error(
        `OscillatorBank: frequencies length ${freqs.length} ` +
          `does not match N ${this.N}`,
      );
    }
    this.frequencies.set(freqs);
  }
}
