/**
 * src/lib/training/runner.ts
 *
 * Pure-JS in-process training loop. No Python, no PyTorch.
 * Runs inside Vercel serverless functions.
 *
 * Architecture mirrors the Python model:
 *   - Sorting-sequences task: argmin over 4-element sequences, 5 classes
 *   - Tiny linear model (embedding → hidden → logits) trained with SGD
 *   - Cross-entropy loss, softmax output
 *
 * This is intentionally a lightweight stand-in that actually trains and
 * produces real loss curves. The "real" model (CTM/BaselineTransformer)
 * will run on a dedicated compute environment when that's set up.
 */

export interface TrainResult {
  finalTrainLoss: number;
  finalValLoss: number;
  finalValAccuracy: number;
  epochHistory: EpochRecord[];
}

export interface EpochRecord {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  valAccuracy: number;
}

// ── Seeded RNG (LCG) ──────────────────────────────────────────────────────────

function makeLCG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

// ── Data generation ───────────────────────────────────────────────────────────

interface Sample {
  input: number[];   // 4 integers, one-hot encoded → flat [20] vector
  label: number;     // argmin (class 0-4 = position of minimum)
}

function generateSortingSample(rng: () => number): Sample {
  const seq = Array.from({ length: 4 }, () => Math.floor(rng() * 100));
  const label = seq.indexOf(Math.min(...seq));
  // One-hot encode each element in 0..19 → 5 buckets per element
  const input = new Array<number>(20).fill(0);
  for (let i = 0; i < 4; i++) {
    const bucket = Math.min(Math.floor(seq[i] / 20), 4);
    input[i * 5 + bucket] = 1;
  }
  return { input, label };
}

function generateDataset(n: number, seed: number): Sample[] {
  const rng = makeLCG(seed);
  return Array.from({ length: n }, () => generateSortingSample(rng));
}

// ── Tiny linear model (input[20] → hidden[16] → logits[5]) ───────────────────

interface Params {
  W1: number[][];   // [16, 20]
  b1: number[];     // [16]
  W2: number[][];   // [5, 16]
  b2: number[];     // [5]
}

function initParams(seed: number): Params {
  const rng = makeLCG(seed + 1);
  const xavier = (fan_in: number) => (rng() * 2 - 1) * Math.sqrt(2 / fan_in);
  return {
    W1: Array.from({ length: 16 }, () => Array.from({ length: 20 }, () => xavier(20))),
    b1: new Array(16).fill(0),
    W2: Array.from({ length: 5 }, () => Array.from({ length: 16 }, () => xavier(16))),
    b2: new Array(5).fill(0),
  };
}

function relu(x: number[]): number[] {
  return x.map((v) => Math.max(0, v));
}

function softmax(x: number[]): number[] {
  const max = Math.max(...x);
  const exps = x.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

function matVec(W: number[][], x: number[], b: number[]): number[] {
  return W.map((row, i) => row.reduce((s, w, j) => s + w * x[j], 0) + b[i]);
}

interface ForwardResult {
  h: number[];
  logits: number[];
  probs: number[];
}

function forward(params: Params, input: number[]): ForwardResult {
  const h = relu(matVec(params.W1, input, params.b1));
  const logits = matVec(params.W2, h, params.b2);
  const probs = softmax(logits);
  return { h, logits, probs };
}

function crossEntropy(probs: number[], label: number): number {
  return -Math.log(Math.max(probs[label], 1e-9));
}

// ── Backward pass (manual gradients) ─────────────────────────────────────────

interface Grads {
  dW1: number[][];
  db1: number[];
  dW2: number[][];
  db2: number[];
}

function backward(
  params: Params,
  input: number[],
  h: number[],
  probs: number[],
  label: number,
): Grads {
  // dL/d_logits = probs - one_hot(label)
  const dLogits = probs.map((p, i) => p - (i === label ? 1 : 0));

  // dL/dW2[i][j] = dLogits[i] * h[j]
  const dW2 = params.W2.map((_, i) => h.map((hj) => dLogits[i] * hj));
  const db2 = dLogits.slice();

  // dL/dh = W2^T dLogits
  const dh = h.map((_, j) =>
    params.W2.reduce((s, row, i) => s + row[j] * dLogits[i], 0),
  );

  // Through ReLU
  const dh_pre = dh.map((v, i) => (h[i] > 0 ? v : 0));

  // dL/dW1[i][j] = dh_pre[i] * input[j]
  const dW1 = params.W1.map((_, i) => input.map((xj) => dh_pre[i] * xj));
  const db1 = dh_pre.slice();

  return { dW1, db1, dW2, db2 };
}

function sgdStep(params: Params, grads: Grads, lr: number): void {
  for (let i = 0; i < params.W1.length; i++) {
    for (let j = 0; j < params.W1[i].length; j++) {
      params.W1[i][j] -= lr * grads.dW1[i][j];
    }
    params.b1[i] -= lr * grads.db1[i];
  }
  for (let i = 0; i < params.W2.length; i++) {
    for (let j = 0; j < params.W2[i].length; j++) {
      params.W2[i][j] -= lr * grads.dW2[i][j];
    }
    params.b2[i] -= lr * grads.db2[i];
  }
}

// ── Training loop ─────────────────────────────────────────────────────────────

export function runTraining(opts: {
  modelTemplate: string;
  dataSource: string;
  epochs: number;
  seed?: number;
}): TrainResult {
  const { epochs, seed = 42 } = opts;

  const trainData = generateDataset(500, seed);
  const valData = generateDataset(100, seed + 1);
  const params = initParams(seed);
  const lr = 0.05;

  const history: EpochRecord[] = [];

  for (let epoch = 1; epoch <= epochs; epoch++) {
    // Shuffle train data
    const rng = makeLCG(seed + epoch);
    const shuffled = [...trainData].sort(() => rng() - 0.5);

    // Train
    let trainLossSum = 0;
    for (const { input, label } of shuffled) {
      const { h, probs } = forward(params, input);
      trainLossSum += crossEntropy(probs, label);
      const grads = backward(params, input, h, probs, label);
      sgdStep(params, grads, lr);
    }
    const trainLoss = trainLossSum / shuffled.length;

    // Validate
    let valLossSum = 0;
    let correct = 0;
    for (const { input, label } of valData) {
      const { probs } = forward(params, input);
      valLossSum += crossEntropy(probs, label);
      if (probs.indexOf(Math.max(...probs)) === label) correct++;
    }
    const valLoss = valLossSum / valData.length;
    const valAccuracy = correct / valData.length;

    history.push({ epoch, trainLoss, valLoss, valAccuracy });
  }

  const last = history[history.length - 1];
  return {
    finalTrainLoss: last.trainLoss,
    finalValLoss: last.valLoss,
    finalValAccuracy: last.valAccuracy,
    epochHistory: history,
  };
}
