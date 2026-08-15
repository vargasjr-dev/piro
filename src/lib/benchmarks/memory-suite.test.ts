import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MEMORY_SUITE_CASES, memorySuite } from "./memory-suite";
import { type MemorySuiteEvaluationConfig } from "../datasets/evaluation-config";
import type { BenchmarkContext, GenerateResult, ModelAdapter } from "./types";

function result(text: string): GenerateResult {
  return { text, inputTokens: 3, outputTokens: 1 };
}

test("MemorySuite has ten stable cases in the published order", () => {
  assert.equal(MEMORY_SUITE_CASES.length, 10);
  assert.deepEqual(
    MEMORY_SUITE_CASES.map((testCase) => testCase.id),
    [
      "delayed-single-fact",
      "multi-fact-binding",
      "explicit-overwrite",
      "temporal-version",
      "near-neighbor-interference",
      "ordered-sequence",
      "two-hop-relation",
      "source-attribution",
      "capacity-long-gap",
      "authority-conflict",
    ],
  );
});

test("MemorySuite runs one isolated ordered sequence per case", async () => {
  const calls: Array<{ inputs: string[] }> = [];
  const model: ModelAdapter = {
    name: "fake-memory-model",
    generate: async () => result("unused"),
    generateSequence: async (inputs) => {
      calls.push({ inputs });
      return result(MEMORY_SUITE_CASES[calls.length - 1]!.expected);
    },
  };

  const context: BenchmarkContext = {
    datasetR2Prefix: "users/test/datasets/memory-suite",
    evaluationConfig: {
      evaluator: "memory_suite",
      caseCount: 10,
      protocol: "ordered_sequence",
      inputFormat: "plain_text",
    } satisfies MemorySuiteEvaluationConfig,
  };
  const benchmark = await memorySuite.run(model, context);

  assert.equal(calls.length, MEMORY_SUITE_CASES.length);
  assert.match(
    calls[0]?.inputs[0] ?? "",
    /Store facts from earlier turns exactly/,
  );
  assert.notEqual(calls[0]?.inputs, calls[1]?.inputs);
  assert.equal(benchmark.score, 1);
  assert.equal(benchmark.metadata.resetBetweenCases, true);
  assert.equal(benchmark.metadata.passed, 10);
});

test("MemorySuite records exact failures while normalizing a concise answer", async () => {
  let call = 0;
  const model: ModelAdapter = {
    name: "fake-memory-model",
    generate: async () => result("unused"),
    generateSequence: async () => {
      call += 1;
      return result(call === 1 ? " Answer: cobalt. " : "wrong");
    },
  };

  const context: BenchmarkContext = {
    datasetR2Prefix: "users/test/datasets/memory-suite",
    evaluationConfig: {
      evaluator: "memory_suite",
      caseCount: 10,
      protocol: "ordered_sequence",
      inputFormat: "plain_text",
    } satisfies MemorySuiteEvaluationConfig,
  };
  const benchmark = await memorySuite.run(model, context);
  const caseResults = benchmark.metadata.caseResults as Array<{
    id: string;
    actual: string;
    passed: boolean;
  }>;

  assert.equal(benchmark.score, 0.1);
  assert.deepEqual(caseResults[0], {
    id: "delayed-single-fact",
    title: "Delayed single-fact recall",
    category: "retention",
    passed: true,
    expected: "cobalt",
    actual: "cobalt",
    turns: 7,
  });
  assert.equal(caseResults[1]?.passed, false);
});
