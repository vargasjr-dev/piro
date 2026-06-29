import { describe, expect, test } from "bun:test";
import { NeuronHistory } from "../neuron-history";

describe("NeuronHistory", () => {
  test("constructor validates bounds", () => {
    expect(() => new NeuronHistory(0, 10)).toThrow(RangeError);
    expect(() => new NeuronHistory(5000, 10)).toThrow(RangeError);
    expect(() => new NeuronHistory(10, 1)).toThrow(RangeError);
    expect(() => new NeuronHistory(10, 2000)).toThrow(RangeError);
  });

  test("pushing fewer than window activations: not warm, correct size", () => {
    const h = new NeuronHistory(3, 10);
    expect(h.isWarm).toBe(false);
    expect(h.size).toBe(0);

    h.push([1, 2, 3]);
    expect(h.isWarm).toBe(false);
    expect(h.size).toBe(1);

    h.push([4, 5, 6]);
    expect(h.size).toBe(2);
  });

  test("after window fills, isWarm is true and size equals window", () => {
    const h = new NeuronHistory(2, 5);
    for (let t = 0; t < 5; t++) {
      h.push([t, t * 10]);
    }
    expect(h.isWarm).toBe(true);
    expect(h.size).toBe(5);
  });

  test("push validates activation length", () => {
    const h = new NeuronHistory(3, 10);
    expect(() => h.push([1, 2])).toThrow(RangeError);
    expect(() => h.push([1, 2, 3, 4])).toThrow(RangeError);
  });

  test("toActivationMatrix returns correct shape before warm", () => {
    const h = new NeuronHistory(3, 5);
    h.push([1, 2, 3]);
    h.push([4, 5, 6]);

    // 3 neurons × 2 timesteps (neuron-major)
    const mat = h.toActivationMatrix();
    expect(mat.length).toBe(3 * 2);
    // Neuron 0: [1, 4]
    expect(mat[0]).toBe(1);
    expect(mat[1]).toBe(4);
    // Neuron 1: [2, 5]
    expect(mat[2]).toBe(2);
    expect(mat[3]).toBe(5);
    // Neuron 2: [3, 6]
    expect(mat[4]).toBe(3);
    expect(mat[5]).toBe(6);
  });

  test("toActivationMatrix wraps correctly after fill", () => {
    const h = new NeuronHistory(2, 3);
    // Push 4 values: the window should hold t=1, t=2, t=3
    h.push([0, 0]);  // t=0 — dropped
    h.push([1, 10]); // t=1
    h.push([2, 20]); // t=2
    h.push([3, 30]); // t=3

    expect(h.isWarm).toBe(true);
    expect(h.size).toBe(3);

    const mat = h.toActivationMatrix();
    expect(mat.length).toBe(2 * 3);
    // Neuron 0: [1, 2, 3]
    expect(mat[0]).toBe(1);
    expect(mat[1]).toBe(2);
    expect(mat[2]).toBe(3);
    // Neuron 1: [10, 20, 30]
    expect(mat[3]).toBe(10);
    expect(mat[4]).toBe(20);
    expect(mat[5]).toBe(30);
  });

  test("getLatest returns the most recent activation vector", () => {
    const h = new NeuronHistory(3, 5);
    h.push([1, 2, 3]);
    h.push([4, 5, 6]);
    h.push([7, 8, 9]);

    const latest = h.getLatest();
    expect(Array.from(latest)).toEqual([7, 8, 9]);
  });

  test("clear resets buffer", () => {
    const h = new NeuronHistory(2, 4);
    h.push([1, 2]);
    h.push([3, 4]);
    h.clear();
    expect(h.isWarm).toBe(false);
    expect(h.size).toBe(0);
  });
});
