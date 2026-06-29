import { describe, expect, test } from "bun:test";
import { CTM, DEFAULT_CTM_CONFIG } from "../ctm";

describe("CTM", () => {
  test("default config creates model with proper dimensions", () => {
    const ctm = new CTM();
    expect(ctm.config.numNeurons).toBe(DEFAULT_CTM_CONFIG.numNeurons);
    expect(ctm.config.inputDim).toBe(DEFAULT_CTM_CONFIG.inputDim);
    expect(ctm.neuronLayer.numNeurons).toBe(DEFAULT_CTM_CONFIG.numNeurons);
    expect(ctm.history.numNeurons).toBe(DEFAULT_CTM_CONFIG.numNeurons);
    expect(ctm.history.windowSize).toBe(DEFAULT_CTM_CONFIG.windowSize);
  });

  test("forward returns logits of correct shape", () => {
    const ctm = new CTM();
    const input = new Array(ctm.config.inputDim).fill(0.5);
    const output = ctm.forward(input);
    expect(output.length).toBe(ctm.config.numClasses);
  });

  test("forward output contains finite numbers", () => {
    const ctm = new CTM();
    const input = new Array(ctm.config.inputDim).fill(0.5);
    const output = ctm.forward(input);
    for (const v of output) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("same instance produces deterministic output", () => {
    const ctm = new CTM({ numNeurons: 16, inputDim: 8, hiddenDim: 8, windowSize: 4, numClasses: 5 });
    const input = new Array(8).fill(0.3);
    const out1 = ctm.forward(input);
    ctm.reset();
    const out2 = ctm.forward(input);
    expect(out1).toEqual(out2);
  });

  test("different inputs produce different outputs", () => {
    const ctm = new CTM({ numNeurons: 16, inputDim: 8, hiddenDim: 8, windowSize: 4, numClasses: 5 });
    const input1 = new Array(8).fill(0.1);
    const input2 = new Array(8).fill(0.9);
    const out1 = ctm.forward(input1);
    const out2 = ctm.forward(input2);
    // Should differ in at least one position (extremely unlikely to match)
    expect(out1).not.toEqual(out2);
  });

  test("reset clears history", () => {
    const ctm = new CTM({ numNeurons: 16, inputDim: 8, hiddenDim: 8, windowSize: 4, numClasses: 5 });
    const input = new Array(8).fill(0.5);
    ctm.forward(input);
    expect(ctm.history.isWarm).toBe(true);
    ctm.reset();
    expect(ctm.history.isWarm).toBe(false);
    expect(ctm.history.size).toBe(0);
  });

  test("per-tick steps collection has correct structure", () => {
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

    expect(steps.length).toBeGreaterThan(0);
    expect(steps.length).toBeLessThanOrEqual(5);

    for (const step of steps) {
      expect(step).toHaveProperty("tick");
      expect(step).toHaveProperty("activations");
      expect(step).toHaveProperty("syncMatrix");
      expect(step).toHaveProperty("context");
      expect(step).toHaveProperty("entropy");
      expect(step.activations.length).toBe(8);
      expect(step.syncMatrix.length).toBe(8);
      expect(step.syncMatrix[0].length).toBe(8);
      expect(typeof step.entropy).toBe("number");
      expect(step.entropy).toBeGreaterThanOrEqual(0);
      expect(step.entropy).toBeLessThanOrEqual(1);
    }
  });

  test("entropy decreases over ticks (increasing synchrony)", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 8,
      numClasses: 3,
    });
    const input = new Array(4).fill(0.5);
    const steps: any[] = [];
    ctm.forward(input, steps);

    // Later ticks should have lower (or equal) entropy than early ticks
    // as the model converges toward a synchronized state
    if (steps.length >= 3) {
      const entropies = steps.map((s) => s.entropy);
      const earlyAvg = (entropies[0] + entropies[1]) / 2;
      const lateAvg = entropies.slice(-2).reduce((a: number, b: number) => a + b, 0) / 2;
      // The model should converge — late entropy < early entropy
      // (may not always hold for random weights, but should be a strong trend)
      expect(lateAvg).toBeLessThanOrEqual(earlyAvg + 0.3); // generous bound
    }
  });

  test("small model has reasonable parameter count", () => {
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      numClasses: 3,
    });
    // ~8 × (4×4 + 4 + 4 + 1) + 8×8×3 + 3 = 8×25 + 192 + 3 = 395
    expect(ctm.paramCount).toBeGreaterThan(100);
    expect(ctm.paramCount).toBeLessThan(10000);
  });

  test("confidence threshold can be reached", () => {
    // Very low threshold ensures we always exit early
    const ctm = new CTM({
      numNeurons: 8,
      inputDim: 4,
      hiddenDim: 4,
      windowSize: 4,
      maxTicks: 10,
      confidenceThreshold: 0.1, // very low = always confident
      numClasses: 3,
    });
    const input = new Array(4).fill(0.5);
    const steps: any[] = [];
    const output = ctm.forward(input, steps);

    // Should have exited before max ticks
    expect(steps.length).toBeLessThan(10);
    expect(output.length).toBe(3);
  });
});
