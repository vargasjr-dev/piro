import { r2Get } from "~/lib/r2";
import { computeCost } from "./cost";
import type {
  BenchmarkContext,
  BenchmarkDef,
  BenchmarkResult,
  ModelAdapter,
} from "./types";

const DEFAULT_EPISODES = 2_000;
const MAX_FAILURES = 20;

interface AssociativeRecallEpisode {
  inputs: string[];
  answer: string;
  requestCount: number;
}

function extractText(input: unknown): string {
  if (!input || typeof input !== "object")
    throw new Error("Associative Recall input must be an object");
  const parts = (input as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length !== 1)
    throw new Error("Associative Recall input must contain one part");
  const part = parts[0];
  if (
    !part ||
    typeof part !== "object" ||
    typeof (part as { text?: unknown }).text !== "string"
  ) {
    throw new Error("Associative Recall input part must contain text");
  }
  return (part as { text: string }).text;
}

function parseEpisode(record: unknown): AssociativeRecallEpisode {
  if (!record || typeof record !== "object")
    throw new Error("Associative Recall record must be an object");
  const inputs = (record as { inputs?: unknown }).inputs;
  if (!Array.isArray(inputs) || inputs.length < 2) {
    throw new Error(
      "Associative Recall records must contain at least two inputs",
    );
  }
  const texts = inputs.map(extractText);
  const query = texts.at(-1)!;
  const targetLine = texts
    .slice(0, -1)
    .flatMap((text) => text.split("\n"))
    .find((line) => line.startsWith(`${query} = `));
  if (!targetLine)
    throw new Error(`Associative Recall query ${query} has no matching write`);
  return {
    inputs: inputs.map(extractText),
    answer: targetLine.slice(targetLine.indexOf("=") + 1).trim(),
    requestCount: inputs.length,
  };
}

async function loadEpisodes(
  context: BenchmarkContext | undefined,
): Promise<AssociativeRecallEpisode[]> {
  const prefix = context?.datasetR2Prefix;
  if (!prefix)
    throw new Error(
      "Associative Recall evaluation requires a dataset R2 prefix",
    );
  const content = await r2Get(`${prefix.replace(/\/$/, "")}/train.jsonl`);
  if (!content)
    throw new Error("Associative Recall dataset train.jsonl not found");
  const episodes = content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => parseEpisode(JSON.parse(line)));
  if (episodes.length === 0)
    throw new Error("Associative Recall dataset is empty");
  // The Modal trainer uses the first 80% for training and the remaining 20%
  // for validation. Evaluate the same holdout so the comparison is not trained
  // on the exact examples it scores.
  if (context.evaluationConfig.evaluator !== "associative_recall") {
    throw new Error("Associative Recall requires its dataset protocol");
  }
  const holdoutFraction = context.evaluationConfig.holdoutFraction;
  const validationStart = Math.floor(episodes.length * (1 - holdoutFraction));
  const validationEpisodes = episodes.slice(validationStart);
  const limit = Math.max(
    1,
    Math.min(context?.episodes ?? DEFAULT_EPISODES, validationEpisodes.length),
  );
  return validationEpisodes.slice(0, limit);
}

function normalizeAnswer(text: string): string {
  const normalized = text.trim().toLowerCase();
  return /^value_\d{3}$/.test(normalized) ? normalized : normalized;
}

export const associativeRecall: BenchmarkDef = {
  name: "Associative Recall",
  async run(
    model: ModelAdapter,
    context?: BenchmarkContext,
  ): Promise<BenchmarkResult> {
    if (!context) throw new Error("Dataset evaluation context is required");
    const episodes = await loadEpisodes(context);
    if (!model.generateSequence)
      throw new Error(
        `${model.name} does not support ordered Associative Recall inputs`,
      );

    const started = performance.now();
    let correct = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let requestCount = 0;
    let minRequests = Number.POSITIVE_INFINITY;
    let maxRequests = 0;
    const failures: Array<{ expected: string; actual: string }> = [];
    const concurrency = model.name === "gpt-5-nano" ? 8 : 4;

    for (let offset = 0; offset < episodes.length; offset += concurrency) {
      const batch = episodes.slice(offset, offset + concurrency);
      const results = await Promise.all(
        batch.map(async (episode) => {
          const result = await model.generateSequence!(episode.inputs, {
            systemPrompt: context.evaluationConfig.systemPrompt,
          });
          return { episode, result };
        }),
      );
      for (const { episode, result } of results) {
        inputTokens += result.inputTokens;
        outputTokens += result.outputTokens;
        requestCount += episode.requestCount;
        minRequests = Math.min(minRequests, episode.requestCount);
        maxRequests = Math.max(maxRequests, episode.requestCount);
        const actual = normalizeAnswer(result.text);
        if (actual === episode.answer.toLowerCase()) correct += 1;
        else if (failures.length < MAX_FAILURES)
          failures.push({ expected: episode.answer, actual });
      }
    }

    const durationMs = Math.round(performance.now() - started);
    const costUsd = computeCost(model, inputTokens, outputTokens);
    return {
      score: correct / episodes.length,
      durationMs,
      costUsd,
      metadata: {
        modelName: model.name,
        targetKey: model.targetKey ?? model.name,
        episodes: episodes.length,
        correct,
        inputTokens,
        outputTokens,
        tokenAccounting: model.tokenAccounting ?? "not_applicable",
        failures,
        protocol: context.evaluationConfig.protocol,
        inputFormat: context.evaluationConfig.inputFormat,
        systemPrompt: context.evaluationConfig.systemPrompt,
        holdoutFraction:
          context.evaluationConfig.evaluator === "associative_recall"
            ? context.evaluationConfig.holdoutFraction
            : null,
        requestCount,
        requestCountPerEpisode: episodes.length
          ? requestCount / episodes.length
          : 0,
        minRequestsPerEpisode: Number.isFinite(minRequests) ? minRequests : 0,
        maxRequestsPerEpisode: maxRequests,
        averageInputTokensPerEpisode: episodes.length
          ? inputTokens / episodes.length
          : 0,
        averageOutputTokensPerEpisode: episodes.length
          ? outputTokens / episodes.length
          : 0,
      },
    };
  },
};
