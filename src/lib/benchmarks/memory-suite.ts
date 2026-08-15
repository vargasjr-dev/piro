import { computeCost } from "./cost";
import type {
  BenchmarkContext,
  BenchmarkDef,
  BenchmarkResult,
  ModelAdapter,
} from "./types";

export const MEMORY_SUITE_NAME = "MemorySuite";

const MEMORY_SUITE_INSTRUCTIONS =
  "Store facts from earlier turns exactly. Reply ACK to observations. For the final question, reply with only the requested answer and no explanation or punctuation.";

export type MemoryCaseCategory =
  | "retention"
  | "binding"
  | "updates"
  | "interference"
  | "relations"
  | "capacity"
  | "authority";

export interface MemorySuiteCase {
  id: string;
  title: string;
  category: MemoryCaseCategory;
  inputs: string[];
  expected: string;
}

export interface MemorySuiteCaseResult {
  id: string;
  title: string;
  category: MemoryCaseCategory;
  passed: boolean;
  expected: string;
  actual: string;
  turns: number;
}

function makeCase(
  id: string,
  title: string,
  category: MemoryCaseCategory,
  observations: string[],
  question: string,
  expected: string,
): MemorySuiteCase {
  return {
    id,
    title,
    category,
    inputs: [
      `${MEMORY_SUITE_INSTRUCTIONS}\n\n${observations[0] ?? ""}`,
      ...observations.slice(1),
      `FINAL QUESTION: ${question} Reply with exactly one token.`,
    ],
    expected,
  };
}

function makeLongGapCase(): MemorySuiteCase {
  const facts = [
    "anchor-000 = fuchsia",
    ...Array.from(
      { length: 32 },
      (_, index) =>
        `slot-${String(index + 1).padStart(3, "0")} = color-${index + 1}`,
    ),
  ];
  const distractors = Array.from(
    { length: 32 },
    (_, index) =>
      `distractor-${String(index + 1).padStart(3, "0")} = noise-${index + 1}`,
  );
  return makeCase(
    "capacity-long-gap",
    "Long-gap capacity",
    "capacity",
    [...facts, ...distractors],
    "What value is stored for anchor-000?",
    "fuchsia",
  );
}

export const MEMORY_SUITE_CASES: readonly MemorySuiteCase[] = [
  makeCase(
    "delayed-single-fact",
    "Delayed single-fact recall",
    "retention",
    [
      "orchid-17 = cobalt",
      "distractor-a = linen",
      "distractor-b = copper",
      "distractor-c = moss",
      "distractor-d = pearl",
      "distractor-e = scarlet",
    ],
    "What value is stored for orchid-17?",
    "cobalt",
  ),
  makeCase(
    "multi-fact-binding",
    "Multi-fact binding",
    "binding",
    [
      "maris favorite-tool = compass",
      "oren favorite-tool = lantern",
      "pavel favorite-tool = telescope",
      "sana favorite-tool = chisel",
    ],
    "What is oren favorite-tool?",
    "lantern",
  ),
  makeCase(
    "explicit-overwrite",
    "Memory update and overwrite",
    "updates",
    ["vault-31 = amber", "UPDATE: vault-31 = indigo"],
    "What is the newest value stored for vault-31?",
    "indigo",
  ),
  makeCase(
    "temporal-version",
    "Temporal version recall",
    "updates",
    ["09:00 route = north", "09:05 route = south", "09:10 route = east"],
    "What is the current route?",
    "east",
  ),
  makeCase(
    "near-neighbor-interference",
    "Near-neighbor interference",
    "interference",
    [
      "key-101 = amber",
      "key-102 = indigo",
      "key-103 = violet",
      "key-104 = silver",
      "key-105 = coral",
    ],
    "What value is stored for key-102?",
    "indigo",
  ),
  makeCase(
    "ordered-sequence",
    "Ordered sequence memory",
    "binding",
    [
      "sequence position 1 = cinder",
      "sequence position 2 = glass",
      "sequence position 3 = orbit",
      "sequence position 4 = moss",
      "sequence position 5 = lantern",
    ],
    "What item comes immediately after orbit?",
    "moss",
  ),
  makeCase(
    "two-hop-relation",
    "Two-hop relational retrieval",
    "relations",
    ["Mira owns box-7", "box-7 contains seal-3"],
    "What seal is associated with Mira?",
    "seal-3",
  ),
  makeCase(
    "source-attribution",
    "Source-attributed recall",
    "relations",
    [
      "NOTE-A: project-atlas owner = mira",
      "NOTE-B: project-ember owner = sol",
      "NOTE-C: project-cinder owner = noa",
    ],
    "Which note states the owner of project-ember?",
    "note-b",
  ),
  makeLongGapCase(),
  makeCase(
    "authority-conflict",
    "Conflict resolution by authority",
    "authority",
    [
      "AUTHORITATIVE RECORD: vault-code = indigo",
      "UNVERIFIED COMMENT: vault-code = amber",
    ],
    "What is the authoritative value for vault-code?",
    "indigo",
  ),
];

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^answer:\s*/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

export const memorySuite: BenchmarkDef = {
  name: MEMORY_SUITE_NAME,

  async run(
    model: ModelAdapter,
    context?: BenchmarkContext,
  ): Promise<BenchmarkResult> {
    if (context?.evaluationConfig.evaluator !== "memory_suite") {
      throw new Error("MemorySuite requires its dataset protocol");
    }
    if (!model.generateSequence) {
      throw new Error(`${model.name} does not support memory sequences`);
    }

    const started = performance.now();
    let inputTokens = 0;
    let outputTokens = 0;
    const caseResults: MemorySuiteCaseResult[] = [];

    for (const testCase of MEMORY_SUITE_CASES) {
      const result = await model.generateSequence(testCase.inputs);
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      const actual = normalizeAnswer(result.text);
      caseResults.push({
        id: testCase.id,
        title: testCase.title,
        category: testCase.category,
        passed: actual === testCase.expected,
        expected: testCase.expected,
        actual,
        turns: testCase.inputs.length,
      });
    }

    const passed = caseResults.filter((testCase) => testCase.passed).length;
    return {
      score: passed / MEMORY_SUITE_CASES.length,
      durationMs: Math.round(performance.now() - started),
      costUsd: computeCost(model, inputTokens, outputTokens),
      metadata: {
        suite: "memory",
        cases: MEMORY_SUITE_CASES.length,
        passed,
        failed: MEMORY_SUITE_CASES.length - passed,
        inputTokens,
        outputTokens,
        tokenAccounting: model.tokenAccounting ?? "not_applicable",
        resetBetweenCases: true,
        caseResults,
      },
    };
  },
};
