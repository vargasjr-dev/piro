import type { TokenAccounting, TokenPricing } from "./types";

export interface ChatTargetConfig {
  targetKey: string;
  name: string;
  endpoint: string;
  apiModelName: string;
  apiKeyEnvVar?: string;
  pricing?: TokenPricing;
  tokenAccounting: TokenAccounting;
  costAccounting: "token_pricing" | "modal_runtime" | "not_applicable";
}

const GEMMA_MODAL_ENDPOINT =
  "https://dvargasfuertes--piro-gemma-vllm-server.modal.run/v1";

/** Explicitly configured external benchmark targets. */
export const BENCHMARK_TARGETS: Record<string, ChatTargetConfig> = {
  "openai:gpt-4o-mini": {
    targetKey: "openai:gpt-4o-mini",
    name: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1",
    apiModelName: "gpt-4o-mini",
    apiKeyEnvVar: "OPENAI_API_KEY",
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    tokenAccounting: "provider_usage",
    costAccounting: "token_pricing",
  },
  "openai:gpt-4o": {
    targetKey: "openai:gpt-4o",
    name: "gpt-4o",
    endpoint: "https://api.openai.com/v1",
    apiModelName: "gpt-4o",
    apiKeyEnvVar: "OPENAI_API_KEY",
    pricing: { inputPerMillion: 2.5, outputPerMillion: 10 },
    tokenAccounting: "provider_usage",
    costAccounting: "token_pricing",
  },
  "openai:gpt-5-nano": {
    targetKey: "openai:gpt-5-nano",
    name: "gpt-5-nano",
    endpoint: "https://api.openai.com/v1",
    apiModelName: "gpt-5-nano",
    apiKeyEnvVar: "OPENAI_API_KEY",
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.4 },
    tokenAccounting: "provider_usage",
    costAccounting: "token_pricing",
  },
  "gemma:google/gemma-3-270m": {
    targetKey: "gemma:google/gemma-3-270m",
    name: "google/gemma-3-270m",
    endpoint: GEMMA_MODAL_ENDPOINT,
    apiModelName: "google/gemma-3-270m",
    pricing: undefined,
    tokenAccounting: "not_applicable",
    costAccounting: "modal_runtime",
  },
};

export function getBenchmarkTarget(
  targetKey: string,
): ChatTargetConfig | undefined {
  return BENCHMARK_TARGETS[targetKey];
}
