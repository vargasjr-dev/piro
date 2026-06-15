/**
 * Minimal linear algebra helpers for pure-TypeScript model layers.
 * No external dependencies — all operations are plain number[].
 */

/** Matrix-vector multiply: (rows×cols) @ (cols,) → (rows,) */
export function matVec(matrix: number[][], vec: number[]): number[] {
  return matrix.map((row) => row.reduce((s, w, j) => s + w * vec[j], 0));
}

/** Dot product of two equal-length vectors */
export function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

/** Element-wise addition */
export function add(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]);
}

/** Scale every element of a vector by a scalar */
export function scale(a: number[], s: number): number[] {
  return a.map((v) => v * s);
}

/** Softmax over a vector (numerically stable) */
export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const sum = exps.reduce((s, v) => s + v, 0);
  return exps.map((v) => v / sum);
}

/** Flatten a 2-D matrix row-major into a 1-D vector */
export function flatten(matrix: number[][]): number[] {
  return matrix.flat();
}
