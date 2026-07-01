import { describe, expect, test } from "bun:test";
import {
  BurstState,
  DEFAULT_BURST_CONFIG,
  applyBurstWeighting,
  type BurstConfig,
} from "../burst-state";

const SMALL_CONFIG: BurstConfig = {
  maxBurstLength: 3,
  burstThreshold: 0.6,
  burstDecay: 0.8,
  refractoryPeriod: 2,
};

describe("BurstState", () => {
  test("constructor creates counters initialized to zero", () => {
    const bs = new BurstState(SMALL_CONFIG, 5);
    expect(bs.numNeurons).toBe(5);
    expect(bs.burstCounter.length).toBe(5);
    expect(bs.refractoryCounter.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(bs.burstCounter[i]).toBe(0);
      expect(bs.refractoryCounter[i]).toBe(0);
    }
    expect(bs.burstingCount).toBe(0);
    expect(bs.refractoryCount).toBe(0);
  });

  test("neuron bursts when activation exceeds threshold", () => {
    const bs = new BurstState(SMALL_CONFIG, 3);
    bs.tick(new Float64Array([0.9, 0.3, 0.7]));

    expect(bs.isBursting(0)).toBe(true);
    expect(bs.isBursting(1)).toBe(false);
    expect(bs.isBursting(2)).toBe(true);
    expect(bs.burstingCount).toBe(2);
  });

  test("burst counter increments each tick while above threshold", () => {
    const bs = new BurstState(SMALL_CONFIG, 1);

    bs.tick(new Float64Array([0.9]));
    expect(bs.burstCounter[0]).toBe(1);

    bs.tick(new Float64Array([0.9]));
    expect(bs.burstCounter[0]).toBe(2);

    bs.tick(new Float64Array([0.9]));
    expect(bs.burstCounter[0]).toBe(3); // maxBurstLength
  });

  test("burst counter does not exceed maxBurstLength", () => {
    const bs = new BurstState(SMALL_CONFIG, 1);

    for (let t = 0; t < 10; t++) {
      bs.tick(new Float64Array([0.9]));
    }

    expect(bs.burstCounter[0]).toBe(SMALL_CONFIG.maxBurstLength);
  });

  test("burst ends and refractory starts when activation drops below threshold", () => {
    const bs = new BurstState(SMALL_CONFIG, 1);

    // Start burst
    bs.tick(new Float64Array([0.9]));
    expect(bs.isBursting(0)).toBe(true);
    expect(bs.refractoryCounter[0]).toBe(0);

    // Below threshold — burst ends, refractory starts
    bs.tick(new Float64Array([0.3]));
    expect(bs.isBursting(0)).toBe(false);
    expect(bs.burstCounter[0]).toBe(0);
    expect(bs.refractoryCounter[0]).toBe(SMALL_CONFIG.refractoryPeriod);
  });

  test("neuron cannot burst during refractory period", () => {
    const bs = new BurstState(SMALL_CONFIG, 1);

    // Start burst
    bs.tick(new Float64Array([0.9]));

    // End burst
    bs.tick(new Float64Array([0.3]));
    expect(bs.refractoryCounter[0]).toBe(2); // refractoryPeriod

    // Strong input during refractory — should NOT start a new burst
    bs.tick(new Float64Array([0.9]));
    expect(bs.isBursting(0)).toBe(false);
    expect(bs.refractoryCounter[0]).toBe(1); // decremented

    // Still refractory
    bs.tick(new Float64Array([0.9]));
    expect(bs.isBursting(0)).toBe(false);
    expect(bs.refractoryCounter[0]).toBe(0); // refractory done

    // Now it can burst again
    bs.tick(new Float64Array([0.9]));
    expect(bs.isBursting(0)).toBe(true);
    expect(bs.burstCounter[0]).toBe(1);
  });

  test("burstProgress returns 0.0 when not bursting", () => {
    const bs = new BurstState(SMALL_CONFIG, 1);
    expect(bs.burstProgress(0)).toBe(0);

    bs.tick(new Float64Array([0.3]));
    expect(bs.burstProgress(0)).toBe(0);
  });

  test("burstProgress increases with burst duration", () => {
    const bs = new BurstState(SMALL_CONFIG, 1);

    bs.tick(new Float64Array([0.9]));
    expect(bs.burstProgress(0)).toBeCloseTo(1 / 3);

    bs.tick(new Float64Array([0.9]));
    expect(bs.burstProgress(0)).toBeCloseTo(2 / 3);

    bs.tick(new Float64Array([0.9]));
    expect(bs.burstProgress(0)).toBeCloseTo(1.0);
  });

  test("reset clears all state", () => {
    const bs = new BurstState(SMALL_CONFIG, 2);

    bs.tick(new Float64Array([0.9, 0.9]));
    bs.tick(new Float64Array([0.3, 0.3])); // end burst, start refractory

    expect(bs.burstingCount).toBe(0);
    expect(bs.refractoryCount).toBe(2);

    bs.reset();
    expect(bs.burstingCount).toBe(0);
    expect(bs.refractoryCount).toBe(0);
    for (let i = 0; i < 2; i++) {
      expect(bs.burstCounter[i]).toBe(0);
      expect(bs.refractoryCounter[i]).toBe(0);
    }
  });

  test("mixed activity across neurons works correctly", () => {
    const bs = new BurstState(SMALL_CONFIG, 4);

    // Neuron 0: strong — will burst
    // Neuron 1: moderate — below threshold
    // Neuron 2: strong — will burst
    // Neuron 3: weak
    bs.tick(new Float64Array([0.9, 0.5, 0.8, 0.1]));

    expect(bs.isBursting(0)).toBe(true);
    expect(bs.isBursting(1)).toBe(false);
    expect(bs.isBursting(2)).toBe(true);
    expect(bs.isBursting(3)).toBe(false);
    expect(bs.burstingCount).toBe(2);

    // Neuron 0 drops below threshold — ends burst
    bs.tick(new Float64Array([0.3, 0.5, 0.8, 0.1]));

    expect(bs.isBursting(0)).toBe(false);
    expect(bs.refractoryCounter[0]).toBe(2);
    expect(bs.isBursting(2)).toBe(true); // still bursting
    expect(bs.burstingCount).toBe(1);
    expect(bs.refractoryCount).toBe(1);
  });

  test("default config creates usable state", () => {
    const bs = new BurstState(DEFAULT_BURST_CONFIG, 10);
    expect(bs.numNeurons).toBe(10);
    expect(bs.burstingCount).toBe(0);
  });
});

describe("applyBurstWeighting", () => {
  test("non-bursting neurons are unmodified with zero boost", () => {
    const bs = new BurstState(SMALL_CONFIG, 3);
    const activations = new Float64Array([0.5, 0.3, 0.1]);
    const result = applyBurstWeighting(activations, bs, 0.0);

    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.3);
    expect(result[2]).toBeCloseTo(0.1);
  });

  test("bursting neurons get boosted", () => {
    const bs = new BurstState(SMALL_CONFIG, 1);

    // Start burst
    bs.tick(new Float64Array([0.9]));

    const result = applyBurstWeighting(new Float64Array([0.9]), bs, 0.5);
    // At burst start (progress = 1/3), boost factor = 1 + 0.5 * (1 - 1/3 * (1 - 0.8))
    //   = 1 + 0.5 * (1 - 0.2/3) = 1 + 0.5 * (1 - 0.067) ≈ 1 + 0.5 * 0.933 ≈ 1.467
    // Applied: 0.9 * 1.467 ≈ 1.32, capped at 1.0
    expect(result[0]).toBeCloseTo(1.0); // capped
  });

  test("boost is higher at burst start than burst end", () => {
    const config: BurstConfig = { maxBurstLength: 5, burstThreshold: 0.6, burstDecay: 0.5, refractoryPeriod: 2 };
    const bs = new BurstState(config, 1);

    // Tick 1: start burst
    bs.tick(new Float64Array([0.9]));
    const boost1 = applyBurstWeighting(new Float64Array([0.7]), bs, 0.5);

    // Tick 2: continue burst
    bs.tick(new Float64Array([0.9]));
    const boost2 = applyBurstWeighting(new Float64Array([0.7]), bs, 0.5);

    // Later ticks have more decay applied (burstProgress is higher)
    // The exact values depend on the formula, but they should be <= the original
    // and generally non-increasing as the burst progresses
    expect(boost2[0]).toBeLessThanOrEqual(boost1[0]);
  });

  test("non-bursting neurons pass through unchanged when others burst", () => {
    const bs = new BurstState(SMALL_CONFIG, 3);

    // Neuron 0 only bursts
    bs.tick(new Float64Array([0.9, 0.3, 0.2]));

    const result = applyBurstWeighting(new Float64Array([0.9, 0.3, 0.2]), bs, 0.5);
    expect(result[1]).toBeCloseTo(0.3);
    expect(result[2]).toBeCloseTo(0.2);
  });

  test("accepts regular array input", () => {
    const bs = new BurstState(SMALL_CONFIG, 2);

    bs.tick([0.9, 0.3]);

    const result = applyBurstWeighting([0.9, 0.3], bs, 0.5);
    expect(result.length).toBe(2);
    expect(result[1]).toBeCloseTo(0.3);
  });
});
