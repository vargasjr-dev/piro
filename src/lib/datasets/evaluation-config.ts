export interface AssociativeRecallEvaluationConfig {
  evaluator: "associative_recall";
  holdoutFraction: number;
  protocol: "ordered_sequence";
  inputFormat: "parts_text";
}

export interface MemorySuiteEvaluationConfig {
  evaluator: "memory_suite";
  caseCount: 10;
  protocol: "ordered_sequence";
  inputFormat: "plain_text";
}

export type DatasetEvaluationConfig =
  | AssociativeRecallEvaluationConfig
  | MemorySuiteEvaluationConfig;

const ASSOCIATIVE_RECALL_CONFIG: AssociativeRecallEvaluationConfig = {
  evaluator: "associative_recall",
  holdoutFraction: 0.2,
  protocol: "ordered_sequence",
  inputFormat: "parts_text",
};

const MEMORY_SUITE_CONFIG: MemorySuiteEvaluationConfig = {
  evaluator: "memory_suite",
  caseCount: 10,
  protocol: "ordered_sequence",
  inputFormat: "plain_text",
};

/** Dataset creation owns the evaluator and input protocol for each source. */
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
      return typeof config.holdoutFraction === "number" &&
        config.protocol === "ordered_sequence" &&
        config.inputFormat === "parts_text"
        ? (config as AssociativeRecallEvaluationConfig)
        : null;
    }
    if (config.evaluator === "memory_suite") {
      return config.caseCount === 10 &&
        config.protocol === "ordered_sequence" &&
        config.inputFormat === "plain_text"
        ? (config as MemorySuiteEvaluationConfig)
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
