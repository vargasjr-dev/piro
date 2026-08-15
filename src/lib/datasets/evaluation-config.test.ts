import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  evaluationConfigForSource,
  parseDatasetEvaluationConfig,
} from "./evaluation-config";

test("memory-suite source owns the memory evaluator", () => {
  assert.deepEqual(evaluationConfigForSource("sources/memory-suite/main.py"), {
    evaluator: "memory_suite",
    caseCount: 10,
    protocol: "ordered_sequence",
    inputFormat: "plain_text",
  });
});

test("memory-suite evaluation config accepts the persisted protocol shape", () => {
  assert.deepEqual(
    parseDatasetEvaluationConfig(
      JSON.stringify({
        evaluator: "memory_suite",
        caseCount: 10,
        protocol: "ordered_sequence",
        inputFormat: "plain_text",
      }),
    ),
    {
      evaluator: "memory_suite",
      caseCount: 10,
      protocol: "ordered_sequence",
      inputFormat: "plain_text",
    },
  );
});

test("associative-recall config retains its holdout policy", () => {
  assert.deepEqual(
    parseDatasetEvaluationConfig(
      JSON.stringify({
        evaluator: "associative_recall",
        holdoutFraction: 0.2,
        protocol: "ordered_sequence",
        inputFormat: "parts_text",
      }),
    ),
    {
      evaluator: "associative_recall",
      holdoutFraction: 0.2,
      protocol: "ordered_sequence",
      inputFormat: "parts_text",
    },
  );
});

test("unknown evaluation protocols are rejected", () => {
  assert.equal(
    parseDatasetEvaluationConfig(JSON.stringify({ evaluator: "unknown" })),
    null,
  );
});
