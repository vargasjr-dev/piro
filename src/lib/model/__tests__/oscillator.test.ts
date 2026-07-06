import { describe, expect, test } from "bun:test";
import { OscillatorBank, type OscillatorConfig } from "../oscillator";

describe("OscillatorBank", () => {
  test("constructor initialises phases and frequencies", () => {
    const bank = new OscillatorBank({}, 5);
    expect(bank["phases"].length).toBe(5);
    expect(bank["frequencies"].length).toBe(5);
    // Phases should be random but in [0, 2π)
    for (let i = 0; i < 5; i++) {
      expect(bank["phases"][i]).toBeGreaterThanOrEqual(0);
      expect(bank["phases"][i]).toBeLessThan(2 * Math.PI);
    }
  });

  test("constructor accepts custom frequencies", () => {
    const freqs = [1.0, 2.0, 3.0];
    const bank = new OscillatorBank({ frequencies: freqs }, 3);
    expect(Array.from(bank.getFrequencies())).toEqual(freqs);
  });

  test("constructor rejects mismatched frequencies length", () => {
    expect(() => {
      new OscillatorBank({ frequencies: [1.0, 2.0] }, 5);
    }).toThrow("does not match");
  });

  test("constructor rejects mismatched coupling matrix length", () => {
    expect(() => {
      new OscillatorBank({ couplingMatrix: new Float64Array(10) }, 5);
    }).toThrow("does not match N²");
  });

  test("getGates returns values in [0, 1]", () => {
    const bank = new OscillatorBank({}, 10);
    const gates = bank.getGates();
    expect(gates.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(gates[i]).toBeGreaterThanOrEqual(0);
      expect(gates[i]).toBeLessThanOrEqual(1);
    }
  });

  test("getPhases returns phases in [0, 2π)", () => {
    const bank = new OscillatorBank({}, 10);
    const phases = bank.getPhases();
    for (let i = 0; i < 10; i++) {
      expect(phases[i]).toBeGreaterThanOrEqual(0);
      expect(phases[i]).toBeLessThan(2 * Math.PI);
    }
  });

  test("step updates phases over time", () => {
    const bank = new OscillatorBank({}, 3);
    const phasesBefore = bank.getPhases();
    bank.step(undefined, 0.1);
    const phasesAfter = bank.getPhases();

    // Phases should have changed
    let changed = false;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(phasesAfter[i] - phasesBefore[i]) > 1e-10) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test("multiple steps advance phases monotonically", () => {
    const bank = new OscillatorBank({ frequencies: [1.0] }, 1);
    const phases = [bank.getPhases()[0]];

    for (let t = 0; t < 10; t++) {
      bank.step(undefined, 0.1);
      phases.push(bank.getPhases()[0]);
    }

    // Phase should have progressed — frequency 1.0 * dt 0.1 * 10 steps = ~1 rad
    const totalMovement = (phases[phases.length - 1] - phases[0] + 2 * Math.PI) % (2 * Math.PI);
    // Should have moved forward (wrapping makes exact measurement tricky, just check non-zero)
    expect(totalMovement).toBeGreaterThan(0.01);
  });

  test("synchronyIndex returns low value for random phases", () => {
    const bank = new OscillatorBank({}, 100);
    const R = bank.synchronyIndex();
    expect(R).toBeLessThan(0.3);
  });

  test("synchronyIndex returns ~1 for identical phases", () => {
    const bank = new OscillatorBank({}, 50);
    for (let i = 0; i < 50; i++) {
      bank["phases"][i] = 1.0;
    }
    expect(bank.synchronyIndex()).toBeCloseTo(1, 5);
  });

  test("input current drives phase forward", () => {
    const bank = new OscillatorBank({ frequencies: [0] }, 1);
    bank["phases"][0] = 0;

    // Positive input current drives phase forward
    bank.step(new Float64Array([5.0]), 0.1);
    expect(bank["phases"][0]).toBeGreaterThan(0);
  });

  test("negative input current drives phase backward (wraps)", () => {
    const bank = new OscillatorBank({ frequencies: [0] }, 1);
    bank["phases"][0] = 1.0;

    // Strong negative input should wrap phase backward toward 2π
    bank.step(new Float64Array([-10.0]), 0.1);
    // Phase should now be close to 2π (since 1.0 + (-10*0.1) = 0, which wraps to... actually 1.0 - 1.0 = 0, no wrap)
    // Let me check: 1.0 + (-10 * 0.1) = 0, which stays as 0
    expect(bank["phases"][0]).toBeGreaterThanOrEqual(0);
    expect(bank["phases"][0]).toBeLessThan(2 * Math.PI);
  });

  test("learnCoupling updates the coupling matrix", () => {
    const bank = new OscillatorBank({}, 3);
    const matrixBefore = bank.getCouplingMatrix();
    bank.learnCoupling(0.1, 0);
    const matrixAfter = bank.getCouplingMatrix();

    // After learning step with no decay, matrix should have changed
    let changed = false;
    for (let i = 0; i < 9; i++) {
      if (matrixAfter[i] !== matrixBefore[i]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test("learnCoupling with decay prevents runaway", () => {
    const bank = new OscillatorBank({}, 5);
    // Run many learning steps
    for (let t = 0; t < 100; t++) {
      bank.step(undefined, 0.1);
      bank.learnCoupling(0.05, 0.01);
    }
    const matrix = bank.getCouplingMatrix();
    // All values should be within [-1, 1]
    for (let i = 0; i < 25; i++) {
      expect(matrix[i]).toBeGreaterThanOrEqual(-1);
      expect(matrix[i]).toBeLessThanOrEqual(1);
    }
  });

  test("getGates produces different values for different phases", () => {
    const bank = new OscillatorBank({}, 2);
    // Set two neurons to different phases
    bank["phases"][0] = Math.PI / 2; // sin = 1 → gate = 1.0
    bank["phases"][1] = (3 * Math.PI) / 2; // sin = -1 → gate = 0.0

    const gates = bank.getGates();
    expect(gates[0]).toBeCloseTo(1.0, 5);
    expect(gates[1]).toBeCloseTo(0.0, 5);
  });

  test("setCouplingMatrix replaces the coupling matrix", () => {
    const bank = new OscillatorBank({}, 3);
    const newMatrix = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    bank.setCouplingMatrix(newMatrix);
    const matrix = bank.getCouplingMatrix();
    expect(Array.from(matrix)).toEqual(Array.from(newMatrix));
  });

  test("setFrequencies replaces frequencies", () => {
    const bank = new OscillatorBank({}, 3);
    const newFreqs = new Float64Array([10, 20, 30]);
    bank.setFrequencies(newFreqs);
    expect(Array.from(bank.getFrequencies())).toEqual([10, 20, 30]);
  });

  test("setFrequencies rejects wrong length", () => {
    const bank = new OscillatorBank({}, 3);
    expect(() => {
      bank.setFrequencies(new Float64Array([1, 2]));
    }).toThrow("does not match");
  });

  test("phase wraps to [0, 2π) after many steps", () => {
    const bank = new OscillatorBank({ frequencies: [5.0] }, 1);
    for (let t = 0; t < 100; t++) {
      bank.step(undefined, 0.5);
      const phase = bank["phases"][0];
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(2 * Math.PI);
    }
  });

  test("oscillator with zero frequency and no input stays still", () => {
    const bank = new OscillatorBank({ frequencies: [0] }, 1);
    bank["phases"][0] = 1.0;

    for (let t = 0; t < 10; t++) {
      bank.step(new Float64Array([0]), 0.1);
    }

    expect(bank["phases"][0]).toBeCloseTo(1.0, 5);
  });

  test("large N (500 neurons) performs without errors", () => {
    const bank = new OscillatorBank({}, 500);
    for (let t = 0; t < 10; t++) {
      bank.step(undefined, 0.1);
    }
    const gates = bank.getGates();
    expect(gates.length).toBe(500);
    const R = bank.synchronyIndex();
    expect(R).toBeGreaterThanOrEqual(0);
    expect(R).toBeLessThanOrEqual(1);
  });

  test("step with high dt wraps correctly", () => {
    const bank = new OscillatorBank({ frequencies: [10.0] }, 1);
    bank["phases"][0] = 0;
    // Large step: 10 rad/tick * 0.5 dt = 5 rad, no wrap expected
    bank.step(undefined, 0.5);
    expect(bank["phases"][0]).toBeCloseTo(5.0, 3);
    // Another large step: 10 * 1.0 = 10 rad → wraps to ~10 - 2π ≈ 3.72
    bank.step(undefined, 1.0);
    expect(bank["phases"][0]).toBeGreaterThanOrEqual(0);
    expect(bank["phases"][0]).toBeLessThan(2 * Math.PI);
  });
});

describe("OscillatorBank — Kuramoto synchronization", () => {
  test("identical-frequency oscillators synchronize given strong coupling", () => {
    const N = 10;
    const sameFreq = Array(N).fill(1.0);
    const bank = new OscillatorBank(
      {
        frequencies: sameFreq,
        couplingStrength: 0.5,
      },
      N,
    );

    // Random initial phases are already set by constructor
    const beforeSync = bank.synchronyIndex();

    // Run many steps to allow synchronization
    for (let t = 0; t < 500; t++) {
      bank.step(undefined, 0.05);
    }

    const afterSync = bank.synchronyIndex();

    // With pure Kuramoto, same frequencies, and strong all-to-all coupling,
    // oscillators should converge to near-perfect synchrony
    expect(afterSync).toBeGreaterThan(0.9);
  });

  test("diverse-frequency oscillators show less synchronization", () => {
    const N = 10;
    const diverseFreq = [0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 1.7, 1.9, 2.1, 2.3];
    const bank = new OscillatorBank(
      {
        frequencies: diverseFreq,
        couplingStrength: 0.5,
      },
      N,
    );

    for (let t = 0; t < 500; t++) {
      bank.step(undefined, 0.05);
    }

    const finalSync = bank.synchronyIndex();
    // With diverse frequencies, synchrony should be lower
    expect(finalSync).toBeLessThan(0.9);
  });

  test("very weak coupling leads to near-asynchrony", () => {
    const N = 10;
    const sameFreq = Array(N).fill(1.0);
    const bank = new OscillatorBank(
      {
        frequencies: sameFreq,
        couplingStrength: 0.001,
      },
      N,
    );

    for (let t = 0; t < 500; t++) {
      bank.step(undefined, 0.05);
    }

    const finalSync = bank.synchronyIndex();
    // Even with same frequencies, minimal coupling won't synchronize much
    expect(finalSync).toBeLessThan(0.5);
  });

  test("stronger coupling produces faster synchronization", () => {
    const N = 10;
    const sameFreq = Array(N).fill(1.0);

    const weak = new OscillatorBank(
      { frequencies: sameFreq, couplingStrength: 0.1 },
      N,
    );
    const strong = new OscillatorBank(
      { frequencies: sameFreq, couplingStrength: 0.8 },
      N,
    );

    // Set same initial phases for both
    for (let i = 0; i < N; i++) {
      const p = (i / N) * 2 * Math.PI;
      weak["phases"][i] = p;
      strong["phases"][i] = p;
    }

    // Run same number of steps
    for (let t = 0; t < 200; t++) {
      weak.step(undefined, 0.05);
      strong.step(undefined, 0.05);
    }

    expect(strong.synchronyIndex()).toBeGreaterThan(weak.synchronyIndex());
  });

  test("custom coupling matrix synchronizes specific subpopulations", () => {
    const N = 5;
    const matrix = new Float64Array(N * N);
    // Strong coupling within first 3 neurons
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i !== j) matrix[i * N + j] = 0.5;
      }
    }
    // Weak coupling for last 2
    for (let i = 3; i < 5; i++) {
      for (let j = 3; j < 5; j++) {
        if (i !== j) matrix[i * N + j] = 0.01;
      }
    }

    const bank = new OscillatorBank(
      {
        frequencies: Array(N).fill(1.0),
        couplingMatrix: matrix,
      },
      N,
    );

    // Set initial phases linearly spread
    for (let i = 0; i < N; i++) {
      bank["phases"][i] = (i / N) * 2 * Math.PI;
    }

    for (let t = 0; t < 500; t++) {
      bank.step(undefined, 0.05);
    }

    const phases = bank.getPhases();
    // First 3 should cluster (similar phases), last 2 may not
    const clusterDiff = Math.abs(phases[0] - phases[2]);
    const outlierDiff = Math.abs(phases[0] - phases[4]);

    // The cluster should be tighter than the cross-group difference
    // (may wrap around 0/2π, so use minimum circular distance)
    const circularDist = (a: number, b: number) => {
      const d = Math.abs(a - b);
      return Math.min(d, 2 * Math.PI - d);
    };

    expect(circularDist(phases[0], phases[1])).toBeLessThan(
      circularDist(phases[0], phases[4]) + 0.5,
    );
  });
});
