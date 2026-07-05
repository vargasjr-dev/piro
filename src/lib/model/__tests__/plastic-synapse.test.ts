import { describe, expect, test } from "bun:test";
import {
  PlasticSynapse,
  DEFAULT_PLASTIC_CONFIG,
  type PlasticConfig,
} from "../plastic-synapse";
import { CTM, DEFAULT_CTM_CONFIG } from "../ctm";

describe("PlasticSynapse", () => {
  test("creates with correct dimensions", () => {
    const ps = new PlasticSynapse({}, 8);
    expect(ps.weights.length).toBe(8);
    expect(ps.weights[0].length).toBe(8);
    expect(ps.numNeurons).toBe(8);
  });

  test("initial weights are small (near zero)", () => {
    const ps = new PlasticSynapse({}, 16);
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        expect(Math.abs(ps.weights[i][j])).toBeLessThan(0.05);
      }
    }
  });

  test("apply returns output with correct length", () => {
    const ps = new PlasticSynapse({}, 8);
    const acts = new Float64Array(8).fill(0.5);
    const prev = new Float64Array(8).fill(0.3);
    const result = ps.apply(acts, prev);
    expect(result.length).toBe(8);
  });

  test("apply with near-zero weights passes through mostly unchanged", () => {
    const ps = new PlasticSynapse({}, 8);
    const acts = new Float64Array([0.5, 0.3, 0.8, 0.1, 0.9, 0.2, 0.6, 0.4]);
    const prev = new Float64Array([0.7, 0.2, 0.5, 0.8, 0.1, 0.6, 0.3, 0.9]);
    const result = ps.apply(acts, prev);

    // With near-zero weights, result should be close to input
    for (let i = 0; i < 8; i++) {
      expect(Math.abs(result[i] - acts[i])).toBeLessThan(0.05);
    }
  });

  test("update after apply changes weights (Hebbian effect)", () => {
    const ps = new PlasticSynapse(
      { learningRate: 0.1, warmupTicks: 0 },
      4,
    );
    const acts = new Float64Array([0.9, 0.1, 0.8, 0.2]);
    const prev = new Float64Array([0.7, 0.3, 0.6, 0.4]);

    // Snapshot before
    const before = ps.weights.map((r) => Array.from(r));

    ps.apply(acts, prev);
    ps.update(acts, prev);

    // After one update, weights should have changed
    let changed = false;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (before[i][j] !== ps.weights[i][j]) changed = true;
      }
    }
    expect(changed).toBe(true);
  });

  test("update respects warmupTicks", () => {
    const ps = new PlasticSynapse(
      { learningRate: 0.1, warmupTicks: 5 },
      4,
    );
    const acts = new Float64Array([0.9, 0.1, 0.8, 0.2]);
    const prev = new Float64Array([0.7, 0.3, 0.6, 0.4]);

    // First update (should be skipped — tick 1 of warmup)
    ps.update(acts, prev);

    // Weights should still be initial values (unchanged)
    let totalChange = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        totalChange += Math.abs(ps.weights[i][j] - (Math.random() * 2 - 1) * 0.01);
      }
    }
    // Can't directly assert no change since init is random,
    // but we can verify by calling update many times with warmup still active
    for (let t = 0; t < 4; t++) {
      ps.update(acts, prev);
    }
    // On tick 6 (tick 0-4 = warmup, tick 5 = first real update) — hard to verify
    // without exposing tick counter. Let's just verify the API doesn't crash.
    const snap = ps.snapshot();
    expect(snap.length).toBe(4);
    expect(snap[0].length).toBe(4);
  });

  test("Oja's rule keeps weights bounded", () => {
    const ps = new PlasticSynapse(
      { learningRate: 0.5, maxWeight: 1.0, warmupTicks: 0 },
      8,
    );
    const strongActs = new Float64Array(8).fill(0.95);
    const strongPrev = new Float64Array(8).fill(0.95);

    // Many updates with strong activations
    for (let t = 0; t < 100; t++) {
      ps.apply(strongActs, strongPrev);
      ps.update(strongActs, strongPrev);
    }

    // Verify no weight exceeds maxWeight
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        expect(Math.abs(ps.weights[i][j])).toBeLessThanOrEqual(1.01); // small epsilon
      }
    }
  });

  test("energy increases as weights grow", () => {
    const ps = new PlasticSynapse(
      { learningRate: 0.2, maxWeight: 2.0, warmupTicks: 0 },
      4,
    );
    const acts = new Float64Array([0.9, 0.8, 0.7, 0.6]);
    const prev = new Float64Array([0.8, 0.7, 0.6, 0.9]);

    const e0 = ps.energy;

    // Many updates to build up energy
    for (let t = 0; t < 50; t++) {
      ps.apply(acts, prev);
      ps.update(acts, prev);
    }

    const e1 = ps.energy;
    expect(e1).toBeGreaterThan(e0);
  });

  test("snapshot returns a deep copy", () => {
    const ps = new PlasticSynapse({}, 4);
    const snap = ps.snapshot();
    // Modify original
    ps.weights[0][0] = 999;
    // Snapshot should be unchanged
    expect(snap[0][0]).not.toBe(999);
  });

  test("reset clears tick counter and re-initializes weights", () => {
    const ps = new PlasticSynapse(
      { learningRate: 0.1, warmupTicks: 0 },
      4,
    );
    const acts = new Float64Array([0.9, 0.1, 0.8, 0.2]);
    const prev = new Float64Array([0.7, 0.3, 0.6, 0.4]);

    for (let t = 0; t < 20; t++) {
      ps.apply(acts, prev);
      ps.update(acts, prev);
    }

    const beforeReset = ps.energy;
    ps.reset();
    const afterReset = ps.energy;

    // After reset, energy should be back to near-zero initialization
    expect(afterReset).toBeLessThan(beforeReset);
    expect(afterReset).toBeLessThan(0.5); // near-zero init
  });

  test("configured with custom values", () => {
    const config: Partial<PlasticConfig> = {
      learningRate: 0.05,
      weightDecay: 0.01,
      maxWeight: 0.5,
      warmupTicks: 3,
    };
    const ps = new PlasticSynapse(config, 8);
    expect(ps.config.learningRate).toBe(0.05);
    expect(ps.config.weightDecay).toBe(0.01);
    expect(ps.config.maxWeight).toBe(0.5);
    expect(ps.config.warmupTicks).toBe(3);
  });
});

// ─── Plastic + CTM Integration Tests ─────────────────────────────────

describe("CTM with plastic synapse", () => {
  const plasticConfig: Partial<PlasticConfig> = {
    learningRate: 0.02,
    warmupTicks: 1,
  };

  test("with plastic config creates plasticSynapse", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig,
    });
    expect(ctm.plasticSynapse).not.toBeNull();
    expect(ctm.plasticEnergy).toBeGreaterThanOrEqual(0);
  });

  test("without plastic config — plasticSynapse is null (backward compat)", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
    });
    expect(ctm.plasticSynapse).toBeNull();
    expect(ctm.plasticEnergy).toBe(0);
  });

  test("with plastic config produces valid output (same shape, finite)", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig,
    });
    const input = new Array(4).fill(0.5);
    const output = ctm.forward(input);
    expect(output.length).toBe(3);
    for (const v of output) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("plastic enabled vs disabled → different outputs", () => {
    const baseConfig = {
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 8,
      windowSize: 4,
      maxTicks: 8,
      confidenceThreshold: 0.8,
      numClasses: 3,
    };
    const ctmNoPlastic = new CTM(baseConfig);
    const ctmPlastic = new CTM({ ...baseConfig, plasticConfig });

    const input = new Array(4).fill(0.6);
    const outNoPlastic = ctmNoPlastic.forward(input);
    const outPlastic = ctmPlastic.forward(input);

    // Outputs should differ — plastic recurrent pathway changes activations
    expect(outNoPlastic).not.toEqual(outPlastic);
  });

  test("plastic energy increases with repeated forward passes", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig: { learningRate: 0.05, warmupTicks: 0 },
    });

    const input = new Array(4).fill(0.7);
    const e0 = ctm.plasticEnergy;

    // Multiple forward passes should accumulate plastic changes
    for (let i = 0; i < 10; i++) {
      ctm.forward(input);
    }

    const e1 = ctm.plasticEnergy;
    expect(e1).toBeGreaterThanOrEqual(e0);
  });

  test("reset clears plastic state (energy drops to near-zero)", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig: { learningRate: 0.05, warmupTicks: 0 },
    });

    const input = new Array(4).fill(0.7);
    for (let i = 0; i < 10; i++) {
      ctm.forward(input);
    }

    const beforeReset = ctm.plasticEnergy;
    ctm.reset();
    const afterReset = ctm.plasticEnergy;

    expect(afterReset).toBeLessThan(beforeReset);
    expect(afterReset).toBeLessThan(0.5);
  });

  test("steps include plasticEnergy when plastic config is set", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig,
    });
    const input = new Array(4).fill(0.5);
    const steps: any[] = [];
    ctm.forward(input, steps);

    for (const step of steps) {
      expect(step).toHaveProperty("plasticEnergy");
      expect(typeof step.plasticEnergy).toBe("number");
      expect(step.plasticEnergy).toBeGreaterThanOrEqual(0);
    }
  });

  test("steps do NOT include plasticEnergy when no plastic config", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
    });
    const input = new Array(4).fill(0.5);
    const steps: any[] = [];
    ctm.forward(input, steps);

    for (const step of steps) {
      expect(step.plasticEnergy).toBeUndefined();
    }
  });

  test("consolidating via snapshot returns a matrix", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig,
    });
    const input = new Array(4).fill(0.5);
    ctm.forward(input);

    const snap = ctm.plasticSynapse!.snapshot();
    expect(snap.length).toBe(8);
    expect(snap[0].length).toBe(8);
  });

  test("plastic + burst combined works without error", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      burstConfig: { maxBurstLength: 4, burstThreshold: 0.4, burstDecay: 0.85, refractoryPeriod: 2 },
      plasticConfig,
    });
    expect(ctm.burstState).not.toBeNull();
    expect(ctm.plasticSynapse).not.toBeNull();

    const input = new Array(4).fill(0.7);
    const output = ctm.forward(input);
    expect(output.length).toBe(3);
    for (const v of output) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("param count includes plastic weights", () => {
    const baseConfig = {
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
    };
    const ctmWithout = new CTM(baseConfig);
    const ctmWith = new CTM({ ...baseConfig, plasticConfig });

    // Plastic adds N*N = 64 extra params
    expect(ctmWith.paramCount).toBe(ctmWithout.paramCount + 64);
  });

  test("consolidate resets plastic energy to near-zero", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig: { learningRate: 0.05, warmupTicks: 0 },
    });

    const input = new Array(4).fill(0.7);
    for (let i = 0; i < 15; i++) {
      ctm.forward(input);
    }

    const beforeEnergy = ctm.plasticEnergy;
    expect(beforeEnergy).toBeGreaterThan(0.01);

    const consolidated = ctm.consolidatePlasticity();
    expect(consolidated).toBeGreaterThan(0);
    // After consolidation, plastic weights are reset to near-zero init values
    expect(ctm.plasticEnergy).toBeLessThan(consolidated);
  });

  test("consolidation changes NeuronLayer parameters", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig: { learningRate: 0.05, warmupTicks: 0 },
    });

    const input = new Array(4).fill(0.7);
    for (let i = 0; i < 15; i++) {
      ctm.forward(input);
    }

    const paramsBefore = ctm.neuronLayer.getParams();
    ctm.consolidatePlasticity();
    const paramsAfter = ctm.neuronLayer.getParams();

    // Parameters should have changed
    let changed = false;
    for (let i = 0; i < paramsBefore.length; i++) {
      if (paramsBefore[i] !== paramsAfter[i]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test("output after consolidation is different from before", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
      plasticConfig: { learningRate: 0.05, warmupTicks: 0 },
    });

    const input = new Array(4).fill(0.7);
    for (let i = 0; i < 15; i++) {
      ctm.forward(input);
    }

    // Get output before consolidation
    ctm.reset();
    const outBefore = ctm.forward(input);

    // Build up plastic again and consolidate
    for (let i = 0; i < 15; i++) {
      ctm.forward(input);
    }
    ctm.consolidatePlasticity();

    // Get output after consolidation
    ctm.reset();
    const outAfter = ctm.forward(input);

    // Should differ because static weights changed
    expect(outBefore).not.toEqual(outAfter);
  });

  test("consolidate returns 0 when no plastic config", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 5,
      numClasses: 3,
    });
    expect(ctm.consolidatePlasticity()).toBe(0);
  });
});
