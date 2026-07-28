import { BENCHMARK_TARGETS } from "./benchmarks/targets";
import type { ChatTargetConfig } from "./benchmarks/targets";

export type HostedModelConfig = ChatTargetConfig & {
  modelId: string;
  displayName: string;
  description: string;
};

const HOSTED_MODEL_DEFINITIONS: Record<
  string,
  Omit<HostedModelConfig, "modelId">
> = {
  "gemma:google/gemma-3-270m": {
    displayName: "Gemma 3 270M",
    description: "Google Gemma 3 270M served through the Piro Gemma endpoint.",
    ...BENCHMARK_TARGETS["gemma:google/gemma-3-270m"],
  },
};

export const HOSTED_MODELS: HostedModelConfig[] = Object.entries(
  HOSTED_MODEL_DEFINITIONS,
).map(([modelId, config]) => ({ modelId, ...config }));

export function getHostedModel(modelId: string): HostedModelConfig | undefined {
  return HOSTED_MODELS.find((model) => model.modelId === modelId);
}

export function getHostedModelByName(
  name: string,
): HostedModelConfig | undefined {
  return HOSTED_MODELS.find((model) => model.displayName === name);
}
