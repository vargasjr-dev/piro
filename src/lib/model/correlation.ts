/**
 * Pearson correlation coefficient between two neuron activation sequences.
 *
 * Returns a value in [-1, 1]:
 *   1.0  — perfectly in-phase (neurons fire together)
 *  -1.0  — perfectly out-of-phase (one fires when the other doesn't)
 *   0.0  — statistically independent
 *
 * Throws if the arrays have different lengths or fewer than 2 elements
 * (correlation is undefined for constant or length-1 sequences).
 */
export function pearsonCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `pearsonCorrelation: arrays must be the same length (got ${a.length} and ${b.length})`,
    );
  }
  if (a.length < 2) {
    throw new Error(
      `pearsonCorrelation: need at least 2 observations (got ${a.length})`,
    );
  }

  const n = a.length;
  const meanA = a.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;

  let num = 0;
  let varA = 0;
  let varB = 0;

  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA * varB);

  // One (or both) sequences are constant — correlation is undefined; return 0.
  if (denom === 0) return 0;

  // Clamp to [-1, 1] to absorb floating-point drift.
  return Math.max(-1, Math.min(1, num / denom));
}

/**
 * Build an N×N pairwise Pearson correlation matrix from a 2-D activation buffer.
 *
 * @param activations  A matrix of shape [numNeurons × numTimesteps] where
 *                     activations[i] is the firing history of neuron i.
 * @returns            An N×N matrix where result[i][j] = pearsonCorrelation(i, j).
 */
export function correlationMatrix(activations: number[][]): number[][] {
  const n = activations.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const r = pearsonCorrelation(activations[i], activations[j]);
      matrix[i][j] = r;
      matrix[j][i] = r; // symmetric
    }
  }
  return matrix;
}
