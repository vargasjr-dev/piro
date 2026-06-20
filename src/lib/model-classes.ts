import { randomUUID } from "crypto";

/**
 * Built-in model class seed data.
 * These two classes correspond to the architectures implemented in model/ctm.py
 * and model/baseline_transformer.py. Seeded once per user on first visit to /classes.
 *
 * `slug` must match the `modelTemplate` string consumed by modal_app.py.
 * `configJson` is a JSON snapshot of the default hyperparams shown on the class card.
 */

export interface ModelClassSeed {
  name: string;
  slug: string;
  description: string;
  parameterCount: number;
  configJson: string;
}

export const DEFAULT_CLASS_SEEDS: ModelClassSeed[] = [
  {
    name: "Continuous Thought Model",
    slug: "ctm",
    description:
      "Iterative tick-loop architecture with sync-driven attention. Neuron state " +
      "accumulates across ticks before committing to an output — trades parameter " +
      "efficiency for internal reasoning depth.",
    parameterCount: 870,
    configJson: JSON.stringify({
      n_neurons: 4,
      embed_dim: 8,
      query_dim: 8,
      value_dim: 8,
      hidden_dim: 16,
      n_classes: 5,
    }),
  },
  {
    name: "Baseline Transformer",
    slug: "baseline-transformer",
    description:
      "2-layer pre-norm transformer with multi-head self-attention. Mean-pools the " +
      "final layer to produce a single classification output. Standard baseline for " +
      "sequence tasks.",
    parameterCount: 857,
    configJson: JSON.stringify({
      embed_dim: 8,
      n_heads: 2,
      ffn_dim: 6,
      n_layers: 2,
      n_classes: 5,
    }),
  },
];

/** Build DB insert rows for all default classes, stamped with the given userId. */
export function buildDefaultClasses(userId: string) {
  return DEFAULT_CLASS_SEEDS.map((seed) => ({
    id: randomUUID(),
    userId,
    ...seed,
  }));
}
