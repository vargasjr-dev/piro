import { r2Get } from "~/lib/r2";
import type {
  BenchmarkContext,
  BenchmarkDef,
  BenchmarkResult,
  ModelAdapter,
} from "./types";
import { computeCost } from "./openai";

const DEFAULT_EPISODES = 2_000;
const MAX_FAILURES = 20;

interface AshfallEpisode {
  inputs: string[];
  answer: string;
  requestCount: number;
}

function extractText(input: unknown): string {
  if (!input || typeof input !== "object")
    throw new Error("Ashfall input must be an object");
  const parts = (input as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length !== 1)
    throw new Error("Ashfall input must contain one part");
  const part = parts[0];
  if (
    !part ||
    typeof part !== "object" ||
    typeof (part as { text?: unknown }).text !== "string"
  ) {
    throw new Error("Ashfall input part must contain text");
  }
  return (part as { text: string }).text;
}

function parseEpisode(record: unknown): AshfallEpisode {
  if (!record || typeof record !== "object")
    throw new Error("Ashfall record must be an object");
  const inputs = (record as { inputs?: unknown }).inputs;
  if (!Array.isArray(inputs) || inputs.length < 2) {
    throw new Error("Ashfall records must contain at least two inputs");
  }
  const texts = inputs.map(extractText);
  const query = texts.at(-1)!;
  const targetLine = texts
    .slice(0, -1)
    .flatMap((text) => text.split("\n"))
    .find((line) => line.startsWith(`${query} = `));
  if (!targetLine)
    throw new Error(`Ashfall query ${query} has no matching write`);
  return {
    inputs: inputs.map(extractText),
    answer: targetLine.slice(targetLine.indexOf("=") + 1).trim(),
    requestCount: inputs.length,
  };
}

async function loadEpisodes(
  context: BenchmarkContext | undefined,
): Promise<AshfallEpisode[]> {
  const prefix = context?.datasetR2Prefix;
  if (!prefix)
    throw new Error("Ashfall evaluation requires a dataset R2 prefix");
  const content = await r2Get(`${prefix.replace(/\/$/, "")}/train.jsonl`);
  if (!content) throw new Error("Ashfall dataset train.jsonl not found");
  const episodes = content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => parseEpisode(JSON.parse(line)));
  if (episodes.length === 0) throw new Error("Ashfall dataset is empty");
  // The Modal trainer uses the first 80% for training and the remaining 20%
  // for validation. Evaluate the same holdout so the comparison is not trained
  // on the exact examples it scores.
  const validationStart = Math.floor(episodes.length * 0.8);
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

export const ashfall: BenchmarkDef = {
  name: "Ashfall",
  async run(
    model: ModelAdapter,
    context?: BenchmarkContext,
  ): Promise<BenchmarkResult> {
    const episodes = await loadEpisodes(context);
    if (!model.generateSequence)
      throw new Error(`${model.name} does not support ordered Ashfall inputs`);

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
          const result = await model.generateSequence!(episode.inputs);
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
    const costUsd = model.targetKey?.startsWith("openai:")
      ? computeCost(
          model.targetKey.slice("openai:".length),
          inputTokens,
          outputTokens,
        )
      : 0;
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
        tokenAccounting:
          model.targetKey?.startsWith("openai:") ||
          model.targetKey?.startsWith("gemma:")
            ? "provider_usage"
            : "not_applicable",
        failures,
        protocol:
          "one separate sequential invocation per ordered input; validation holdout; exact value_NNN match",
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
        stateBoundary:
          model.targetKey?.startsWith("openai:") ||
          model.targetKey?.startsWith("gemma:")
            ? "conversation replayed across the ordered HTTP requests"
            : "serialized recurrent state returned and supplied across the ordered HTTP requests",
      },
    };
  },
};
