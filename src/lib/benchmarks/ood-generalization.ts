import type { BenchmarkDef, BenchmarkResult, ModelAdapter } from "./types";
import { SeededRng, childSeed } from "./rng";

// ── Data generation ───────────────────────────────────────────────────────────

interface SortingSample {
  sequence: number[];
  prompt: string;
  answer: number[];
}

function generateSortingDataset(opts: {
  n: number;
  length: number;
  seed: number;
  split: "train" | "test";
}): SortingSample[] {
  const rng = new SeededRng(childSeed(opts.seed, opts.split));
  const all = Array.from({ length: 99 }, (_, i) => i + 1); // 1..99

  return Array.from({ length: opts.n }, () => {
    const seq = rng.sample(all, opts.length);
    const answer = [...seq].sort((a, b) => a - b);
    const prompt =
      `Sort these numbers from smallest to largest: ${JSON.stringify(seq)}\n` +
      `Response (numbers only, space-separated):`;
    return { sequence: seq, prompt, answer };
  });
}

function parseSortedList(text: string): number[] | null {
  try {
    const nums = text.trim().split(/\s+/).map(Number);
    if (nums.some(isNaN)) return null;
    return nums;
  } catch {
    return null;
  }
}

// ── Benchmark definition ──────────────────────────────────────────────────────

/**
 * OODGeneralization — can the model sort sequences at 4× its training length?
 *
 * Default: train_length=5 → test at length 20, 20 test samples.
 */
export function makeOODGeneralization(opts?: {
  nTest?: number;
  trainLength?: number;
  seed?: number;
}): BenchmarkDef {
  const nTest = opts?.nTest ?? 20;
  const trainLength = opts?.trainLength ?? 5;
  const seed = opts?.seed ?? 42;
  const testLength = trainLength * 4;

  const testSamples = generateSortingDataset({
    n: nTest,
    length: testLength,
    seed,
    split: "test",
  });

  return {
    name: "OODGeneralization",
    threshold: 0.5,

    async run(model: ModelAdapter): Promise<BenchmarkResult> {
      const start = Date.now();
      let nCorrect = 0;
      const failureExamples: string[] = [];

      for (const sample of testSamples) {
        const response = await model.generate(sample.prompt);
        const predicted = parseSortedList(response);
        const correct =
          predicted !== null &&
          predicted.length === sample.answer.length &&
          predicted.every((v, i) => v === sample.answer[i]);

        if (correct) {
          nCorrect++;
        } else if (failureExamples.length < 3) {
          failureExamples.push(
            `expected [${sample.answer.join(" ")}], got "${response.slice(0, 60)}"`,
          );
        }
      }

      const score = nCorrect / testSamples.length;

      return {
        score,
        passed: score >= 0.5,
        threshold: 0.5,
        durationMs: Date.now() - start,
        metadata: {
          n_samples: testSamples.length,
          n_correct: nCorrect,
          test_length: testLength,
          train_length: trainLength,
          failure_examples: failureExamples,
        },
      };
    },
  };
}

export const oodGeneralization = makeOODGeneralization();
