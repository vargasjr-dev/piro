export interface DatasetEvaluationConfig {
  evaluator: "associative_recall";
  systemPrompt: string;
  holdoutFraction: number;
  protocol: "ordered_sequence";
  inputFormat: "parts_text";
}

const ASSOCIATIVE_RECALL_CONFIG: DatasetEvaluationConfig = {
  evaluator: "associative_recall",
  systemPrompt:
    "You receive one associative-memory observation per invocation. Maintain facts across invocations. For writes and distractors, reply only ACK. When the user message is a key_NNN query, reply only the exact value_NNN associated with that key. Do not explain.",
  holdoutFraction: 0.2,
  protocol: "ordered_sequence",
  inputFormat: "parts_text",
};

/** Dataset creation owns the evaluation protocol associated with each source. */
export function evaluationConfigForSource(
  sourcePath: string,
): DatasetEvaluationConfig | null {
  return sourcePath.includes("associative-recall") ||
    sourcePath.includes("associative_recall")
    ? ASSOCIATIVE_RECALL_CONFIG
    : null;
}

export function parseDatasetEvaluationConfig(
  value: string | null,
): DatasetEvaluationConfig | null {
  if (!value) return null;
  try {
    const config = JSON.parse(value) as DatasetEvaluationConfig;
    if (
      config.evaluator !== "associative_recall" ||
      typeof config.systemPrompt !== "string" ||
      typeof config.holdoutFraction !== "number" ||
      config.protocol !== "ordered_sequence" ||
      config.inputFormat !== "parts_text"
    ) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}
