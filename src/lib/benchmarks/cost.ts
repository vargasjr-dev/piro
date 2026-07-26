import type { ModelAdapter } from "./types";

export function computeCost(
  model: ModelAdapter,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (model.costAccounting !== "token_pricing" || !model.pricing) return null;
  return (
    (inputTokens / 1_000_000) * model.pricing.inputPerMillion +
    (outputTokens / 1_000_000) * model.pricing.outputPerMillion
  );
}
