import type { BenchmarkDef, BenchmarkResult, ModelAdapter } from "./types";

/**
 * SanityCheck — does the model return a non-empty string?
 *
 * Threshold is intentionally low (0.1).  If this fails, something is
 * broken in the pipeline, not the model.
 */
export const sanityCheck: BenchmarkDef = {
  name: "SanityCheck",
  threshold: 0.1,

  async run(model: ModelAdapter): Promise<BenchmarkResult> {
    const start = Date.now();
    const response = await model.generate("Say hello.");
    const durationMs = Date.now() - start;

    const score = response.trim().length > 0 ? 1.0 : 0.0;

    return {
      score,
      passed: score >= 0.1,
      threshold: 0.1,
      durationMs,
      metadata: { response: response.slice(0, 120) },
    };
  },
};
