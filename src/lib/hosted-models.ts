import { BENCHMARK_TARGETS } from "./benchmarks/targets";
import type { ChatTargetConfig } from "./benchmarks/targets";

export type HostedModelConfig = ChatTargetConfig & {
  modelId: string;
  slug: string;
  displayName: string;
  description: string;
};

const HOSTED_MODEL_DEFINITIONS: Record<
  string,
  Omit<HostedModelConfig, "modelId">
> = {
  "gemma:google/gemma-3-270m": {
    slug: "gemma-3-270m",
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

export function getHostedModelBySlug(
  slug: string,
): HostedModelConfig | undefined {
  return HOSTED_MODELS.find((model) => model.slug === slug);
}

/**
 * Accept the old display-name route while links migrate to stable slugs.
 * Route params are normally decoded by Next, but decoding here keeps direct
 * requests to previously generated encoded URLs working as well.
 */
export function getHostedModelByRouteKey(
  routeKey: string,
): HostedModelConfig | undefined {
  let decodedRouteKey = routeKey;
  try {
    decodedRouteKey = decodeURIComponent(routeKey);
  } catch {
    // Keep the raw route key for unusual legacy URLs with malformed escapes.
  }

  return (
    getHostedModelBySlug(decodedRouteKey) ??
    HOSTED_MODELS.find((model) => model.displayName === decodedRouteKey)
  );
}
