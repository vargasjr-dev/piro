import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  evaluationConfigForSource,
  MEMORY_SUITE_SYSTEM_PROMPT,
  parseDatasetEvaluationConfig,
} from "./evaluation-config";

test("memory-suite source owns the versioned memory evaluation protocol", () => {
  const config = evaluationConfigForSource("sources/memory-suite/main.py");

  assert.deepEqual(config, {
    evaluator: "memory_suite",
    systemPrompt: MEMORY_SUITE_SYSTEM_PROMPT,
    caseCount: 10,
    protocol: "ordered_sequence",
    inputFormat: "plain_text",
    version: 1,
  });
});

test("memory-suite evaluation config accepts the persisted protocol shape", () => {
  const config = parseDatasetEvaluationConfig(
    JSON.stringify({
      evaluator: "memory_suite",
      systemPrompt: MEMORY_SUITE_SYSTEM_PROMPT,
      caseCount: 10,
      protocol: "ordered_sequence",
      inputFormat: "plain_text",
      version: 1,
    }),
  );

  assert.equal(config?.evaluator, "memory_suite");
});

test("unknown evaluation protocols are rejected", () => {
  assert.equal(
    parseDatasetEvaluationConfig(
      JSON.stringify({ evaluator: "memory_suite", caseCount: 9 }),
    ),
    null,
  );
});
