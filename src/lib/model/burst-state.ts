/**
 * BurstState — Per-Neuron Burst Tracking for the CTM
 *
 * In neuroscience, a burst is a rapid sequence of action potentials (spikes)
 * from a single neuron. In the CTM, this translates to a neuron maintaining
 * a high activation level across multiple ticks — a self-sustaining transient
 * that outlasts the initial driving input.
 *
 * Bursting adds temporal depth to the model: two neurons firing together for
 * 3 ticks have a stronger synchrony signature than two neurons that fire once
 * each. The burst state machine is parameter-free (no learned weights) —
 * burst dynamics emerge from the interaction of existing weights with the
 * burst counters, refractory period, and decay schedule.
 *
 * ## State Machine
 *
 * ```
 *           activation < threshold
 *     IDLE ───────────────────────────► BURSTING
 *      ▲                                     │
 *      │                           burstCounter ≥ maxBurstLength
 *      │                           OR activation < threshold
 *      │                                     ▼
 *      │                              REFRACTORY
 *      │                              (refractoryPeriod ticks)
 *      └─────────────────────────────────────┘
 *           refractoryCounter === 0
 * ```
 *
 * ## Integration
 *
 * The burst state feeds into the sync matrix computation via a
 * burst-weighted correlation function: bursting neurons contribute more
 * to the correlation signal, making sustained co-activity distinguishable
 * from coincidental single-tick firing.
 */

export interface BurstConfig {
  /** Number of consecutive ticks a burst can last (typical: 3-7) */
  maxBurstLength: number;
  /** Activation threshold for burst initiation (typical: 0.5-0.7) */
  burstThreshold: number;
  /** Decay factor per tick during burst (0.0-1.0, typical: 0.7-0.9).
   *  Applied as a multiplier to the raw activation: a higher value means
   *  the burst self-sustains more strongly. */
  burstDecay: number;
  /** Refractory ticks after a burst ends (typical: 1-3).
   *  Prevents immediate re-bursting — the neuron needs to "recover". */
  refractoryPeriod: number;
}

export const DEFAULT_BURST_CONFIG: BurstConfig = {
  maxBurstLength: 5,
  burstThreshold: 0.6,
  burstDecay: 0.85,
  refractoryPeriod: 2,
};

/**
 * BurstState — Per-neuron burst tracking.
 *
 * Tracks two counters per neuron:
 * - `burstCounter`: how many consecutive ticks this neuron has been bursting
 *   (0 = not bursting; 1..maxBurstLength = bursting)
 * - `refractoryCounter`: ticks remaining in refractory period
 *   (0 = ready to burst)
 */
export class BurstState {
  readonly config: BurstConfig;
  readonly numNeurons: number;

  /** Per-neuron burst length counter (0 = not bursting) */
  burstCounter: Uint8Array;
  /** Per-neuron refractory counter (0 = ready to burst) */
  refractoryCounter: Uint8Array;

  constructor(config: BurstConfig, numNeurons: number) {
    this.config = config;
    this.numNeurons = numNeurons;
    this.burstCounter = new Uint8Array(numNeurons);
    this.refractoryCounter = new Uint8Array(numNeurons);
  }

  /**
   * Advance one tick. Updates burst and refractory counters based on
   * current activation values.
   *
   * @param activations — Per-neuron activation values, length must match numNeurons
   */
  tick(activations: Float64Array | number[]): void {
    const { maxBurstLength, burstThreshold, refractoryPeriod } = this.config;

    for (let i = 0; i < this.numNeurons; i++) {
      if (this.refractoryCounter[i] > 0) {
        // In refractory — can't burst, just decrement counter
        this.refractoryCounter[i]--;
        continue;
      }

      if (activations[i] >= burstThreshold) {
        // Above threshold — start or continue burst
        if (this.burstCounter[i] < maxBurstLength) {
          this.burstCounter[i]++;
        }
        // If already at maxBurstLength, stay there (cap)
      } else if (this.burstCounter[i] > 0) {
        // Was bursting but now below threshold — burst ends
        this.burstCounter[i] = 0;
        this.refractoryCounter[i] = refractoryPeriod;
      }
      // else: idle, below threshold, no burst — nothing to do
    }
  }

  /** Is this neuron currently bursting? */
  isBursting(neuronIdx: number): boolean {
    return this.burstCounter[neuronIdx] > 0;
  }

  /**
   * Burst progress: 0.0 = just started, approaching 1.0 = about to end.
   * Returns 0.0 if not bursting.
   */
  burstProgress(neuronIdx: number): number {
    return this.burstCounter[neuronIdx] / this.config.maxBurstLength;
  }

  /** How many neurons are currently bursting? */
  get burstingCount(): number {
    let count = 0;
    for (let i = 0; i < this.numNeurons; i++) {
      if (this.burstCounter[i] > 0) count++;
    }
    return count;
  }

  /** How many neurons are currently refractory? */
  get refractoryCount(): number {
    let count = 0;
    for (let i = 0; i < this.numNeurons; i++) {
      if (this.refractoryCounter[i] > 0) count++;
    }
    return count;
  }

  /** Reset all state — clear all counters. */
  reset(): void {
    this.burstCounter.fill(0);
    this.refractoryCounter.fill(0);
  }
}

/**
 * Apply burst-weighting to an activation vector.
 *
 * Bursting neurons have their activation boosted proportionally to
 * their burst progress, making them more likely to contribute to
 * the correlation matrix.
 *
 * @param activations — Raw activations (length N)
 * @param burstState  — Current burst state
 * @param boostFactor — How much a full burst boosts (default 0.5 = 50% boost at peak)
 * @returns Weighted activation array
 */
export function applyBurstWeighting(
  activations: Float64Array | number[],
  burstState: BurstState,
  boostFactor = 0.5,
): Float64Array {
  const result = new Float64Array(burstState.numNeurons);
  const { config } = burstState;

  for (let i = 0; i < burstState.numNeurons; i++) {
    let value = activations[i];

    if (burstState.isBursting(i)) {
      // Bursting neuron gets a boost that decays as the burst progresses
      // At burst start: full boost
      // At burst end: minimal boost (decay has reduced it)
      const progress = burstState.burstProgress(i);
      const boost = 1.0 + boostFactor * (1.0 - progress * (1.0 - config.burstDecay));
      value = Math.min(1.0, value * boost);
    }

    result[i] = value;
  }

  return result;
}
