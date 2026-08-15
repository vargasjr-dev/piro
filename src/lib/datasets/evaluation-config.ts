export const MEMORY_SUITE_SYSTEM_PROMPT =
  "You are running a temporary memory test. Store facts from earlier turns exactly. Reply ACK to observations. For the final question, reply with only the requested answer and no explanation or punctuation.";

export interface AssociativeRecallEvaluationConfig {
  evaluator: "associative_recall";
  systemPrompt: string;
  holdoutFraction: number;
  protocol: "ordered_sequence";
  inputFormat: "parts_text";
}

export interface MemorySuiteEvaluationConfig {
  evaluator: "memory_suite";
  systemPrompt: string;
  caseCount: 10;
  protocol: "ordered_sequence";
  inputFormat: "plain_text";
  version: 1;
}

export type DatasetEvaluationConfig =
  | AssociativeRecallEvaluationConfig
  | MemorySuiteEvaluationConfig;

const ASSOCIATIVE_RECALL_CONFIG: AssociativeRecallEvaluationConfig = {
  evaluator: "associative_recall",
  systemPrompt:
    "You receive one associative-memory observation per invocation. Maintain facts across invocations. For writes and distractors, reply only ACK. When the user message is a key_NNN query, reply only the exact value_NNN associated with that key. Do not explain.",
  holdoutFraction: 0.2,
  protocol: "ordered_sequence",
  inputFormat: "parts_text",
};

const MEMORY_SUITE_CONFIG: MemorySuiteEvaluationConfig = {
  evaluator: "memory_suite",
  systemPrompt: MEMORY_SUITE_SYSTEM_PROMPT,
  caseCount: 10,
  protocol: "ordered_sequence",
  inputFormat: "plain_text",
  version: 1,
};

/** Dataset creation owns the evaluation protocol associated with each source. */
export function evaluationConfigForSource(
  sourcePath: string,
): DatasetEvaluationConfig | null {
  if (
    sourcePath.includes("associative-recall") ||
    sourcePath.includes("associative_recall")
  ) {
    return ASSOCIATIVE_RECALL_CONFIG;
  }
  return sourcePath.includes("memory-suite") ||
    sourcePath.includes("memory_suite")
    ? MEMORY_SUITE_CONFIG
    : null;
}

export function parseDatasetEvaluationConfig(
  value: string | null,
): DatasetEvaluationConfig | null {
  if (!value) return null;
  try {
    const config = JSON.parse(value) as Partial<DatasetEvaluationConfig>;
    if (config.evaluator === "associative_recall") {
      return typeof config.systemPrompt === "string" &&
        typeof config.holdoutFraction === "number" &&
        config.protocol === "ordered_sequence" &&
        config.inputFormat === "parts_text"
        ? (config as AssociativeRecallEvaluationConfig)
        : null;
    }
    if (config.evaluator === "memory_suite") {
      return typeof config.systemPrompt === "string" &&
        config.caseCount === 10 &&
        config.protocol === "ordered_sequence" &&
        config.inputFormat === "plain_text" &&
        config.version === 1
        ? (config as MemorySuiteEvaluationConfig)
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
