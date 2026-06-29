import { describe, expect, test } from "bun:test";
import { NeuronLayer } from "../neuron-layer";

describe("NeuronLayer", () => {
  test("constructor validates params", () => {
    expect(() => new NeuronLayer(0, 4, 8)).toThrow(RangeError);
    expect(() => new NeuronLayer(4, 0, 8)).toThrow(RangeError);
    expect(() => new NeuronLayer(4, 4, 0)).toThrow(RangeError);
  });

  test("forward produces correct output shape", () => {
    const layer = new NeuronLayer(8, 4, 6, "relu", () => 0.5);
    const output = layer.forward([0.1, 0.2, 0.3, 0.4]);
    expect(output.length).toBe(8);
  });

  test("deterministic with seeded rng", () => {
    const layer1 = new NeuronLayer(4, 3, 4, "relu", () => 0.25);
    const layer2 = new NeuronLayer(4, 3, 4, "relu", () => 0.25);
    const input = [0.5, 0.5, 0.5];
    const out1 = layer1.forward(input);
    const out2 = layer2.forward(input);
    expect(Array.from(out1)).toEqual(Array.from(out2));
  });

  test("different rng seeds produce different outputs", () => {
    let seed1 = 0.1;
    let seed2 = 0.9;
    const layer1 = new NeuronLayer(4, 3, 4, "relu", () => seed1);
    const layer2 = new NeuronLayer(4, 3, 4, "relu", () => seed2);
    const input = [0.5, 0.5, 0.5];
    const out1 = layer1.forward(input);
    const out2 = layer2.forward(input);
    // At least some values should differ (extremely unlikely to match by chance)
    expect(Array.from(out1)).not.toEqual(Array.from(out2));
  });

  test("relu activation: forward produces finite numbers with varied inputs", () => {
    const layer = new NeuronLayer(4, 2, 6, "relu", () => 0.9);
    const output = layer.forward([-100, 100]);
    expect(output.length).toBe(4);
    for (const v of output) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("sigmoid activation: output can be any value (sigmoid only on hidden)", () => {
    const layer = new NeuronLayer(4, 2, 6, "sigmoid", () => 0.5);
    const output = layer.forward([10, -10]);
    expect(output.length).toBe(4);
    for (const v of output) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("tanh activation bounds output", () => {
    const layer = new NeuronLayer(4, 2, 3, "tanh", () => 0.5);
    const output = layer.forward([10, -10]);
    for (const v of output) {
      expect(v).toBeGreaterThan(-1);
      expect(v).toBeLessThan(1);
    }
  });

  test("getParams and setParams round-trip", () => {
    const layer = new NeuronLayer(4, 3, 5, "relu", () => 0.3);
    const params = layer.getParams();
    expect(params.length).toBe(layer.paramCount);

    // Create a new layer and load params
    const layer2 = new NeuronLayer(4, 3, 5, "relu", () => 0.7);
    layer2.setParams(params);

    const input = [0.1, 0.2, 0.3];
    const out1 = layer.forward(input);
    const out2 = layer2.forward(input);
    expect(Array.from(out1)).toEqual(Array.from(out2));
  });

  test("setParams validates length", () => {
    const layer = new NeuronLayer(4, 3, 5);
    expect(() => layer.setParams(new Float64Array(10))).toThrow(RangeError);
  });
});
