import { randomUUID } from "crypto";

/**
 * Built-in benchmark seed data.
 * These three benchmarks correspond to the implementations in:
 *   src/lib/benchmarks/sanity-check.ts
 *   src/lib/benchmarks/ood-generalization.ts
 *   src/lib/benchmarks/adaptive-compute.ts
 *
 * Seeded once per user on first access to /api/benchmark-catalog.
 *
 * `slug` must match the `benchmark.name` string used in runner.ts and
 * stored in benchmark_run.benchmarkName.
 * `configJson` is display-only — actual runtime config lives in the TS files.
 */

export interface BenchmarkDefSeed {
  name: string;
  slug: string;
  description: string;
  configJson: string;
}

export const DEFAULT_BENCHMARK_SEEDS: BenchmarkDefSeed[] = [
  {
    name: "Sanity Check",
    slug: "SanityCheck",
    description:
      "Does the model return a non-empty string? Trivially easy — validates " +
      "the full inference pipeline end-to-end before running heavier benchmarks.",
    configJson: JSON.stringify({
      n_samples: 5,
      task: "argmin",
    }),
  },
  {
    name: "OOD Generalization",
    slug: "OODGeneralization",
    description:
      "Sort sequences at 4× training length (20 elements vs 5 during training). " +
      "Tests whether the model generalizes out-of-distribution on longer inputs.",
    configJson: JSON.stringify({
      n_samples: 20,
      sequence_length: 20,
      task: "argmin",
    }),
  },
  {
    name: "Adaptive Compute",
    slug: "AdaptiveCompute",
    description:
      "Does the model use fewer ticks on easy examples than hard ones? " +
      "10 easy + 10 hard samples. Measures whether internal compute scales with task difficulty.",
    configJson: JSON.stringify({
      n_easy: 10,
      n_hard: 10,
      task: "argmin",
    }),
  },
];

/** Build DB insert rows for all default benchmarks, stamped with the given userId. */
export function buildDefaultBenchmarks(userId: string) {
  return DEFAULT_BENCHMARK_SEEDS.map((seed) => ({
    id: randomUUID(),
    userId,
    ...seed,
  }));
}
