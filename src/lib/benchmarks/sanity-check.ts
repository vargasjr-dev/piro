import type { BenchmarkDef, BenchmarkResult, ModelAdapter } from "./types";
import { computeCost } from "./openai";

/**
 * SanityCheck — does the model return a non-empty string?
 */
export const sanityCheck: BenchmarkDef = {
  name: "SanityCheck",

  async run(model: ModelAdapter): Promise<BenchmarkResult> {
    const start = Date.now();
    const result = await model.generate("Say hello.");
    const durationMs = Date.now() - start;
    const costUsd = computeCost(model.name, result.inputTokens, result.outputTokens);

    return {
      score: result.text.trim().length > 0 ? 1.0 : 0.0,
      durationMs,
      costUsd,
      metadata: { response: result.text.slice(0, 120) },
    };
  },
};
