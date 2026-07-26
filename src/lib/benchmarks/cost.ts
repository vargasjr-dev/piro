import type { ModelAdapter } from "./types";

export function computeCost(
  model: ModelAdapter,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!model.pricing) return 0;
  return (
    (inputTokens / 1_000_000) * model.pricing.inputPerMillion +
    (outputTokens / 1_000_000) * model.pricing.outputPerMillion
  );
}
