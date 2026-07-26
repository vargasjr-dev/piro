import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../data/db";
import {
  benchmarkRun,
  benchmarkSuiteRun,
  model,
  modelHostedApi,
  modelTrainingRun,
} from "../../../data/schema";
import type { BenchmarkContext, BenchmarkDef, ModelAdapter } from "./types";
import { sanityCheck } from "./sanity-check";
import { oodGeneralization } from "./ood-generalization";
import { adaptiveCompute } from "./adaptive-compute";
import { ashfall } from "./ashfall";
import { makeGPTAdapter, makePiroModelAdapter } from "./openai";
import { GEMMA_TARGET, makeGemmaAdapter } from "./gemma";

export const BENCHMARKS: BenchmarkDef[] = [
  sanityCheck,
  oodGeneralization,
  adaptiveCompute,
  ashfall,
];

async function resolveTargets(
  userId: string,
  targetIds: string[] | null,
): Promise<ModelAdapter[]> {
  const requestedVirtualTargets = (targetIds ?? []).filter(
    (id) => id.startsWith("openai:") || id === GEMMA_TARGET,
  );
  const virtualTargets = requestedVirtualTargets.map((target) =>
    target === GEMMA_TARGET
      ? makeGemmaAdapter()
      : makeGPTAdapter(target.slice("openai:".length)),
  );
  const requestedModelIds =
    targetIds?.filter(
      (id) => !id.startsWith("openai:") && id !== GEMMA_TARGET,
    ) ?? null;

  const models = requestedModelIds
    ? requestedModelIds.length
      ? await db
          .select({
            id: model.id,
            name: model.name,
            inferenceEndpoint: model.inferenceEndpoint,
          })
          .from(model)
          .where(
            and(eq(model.userId, userId), inArray(model.id, requestedModelIds)),
          )
      : []
    : await db
        .select({
          id: model.id,
          name: model.name,
          inferenceEndpoint: model.inferenceEndpoint,
        })
        .from(model)
        .where(eq(model.userId, userId));

  if (requestedModelIds && models.length !== requestedModelIds.length) {
    const found = new Set(models.map((item) => item.id));
    const missing = requestedModelIds.filter((id) => !found.has(id));
    throw new Error(
      `Requested model target is unavailable for this user: ${missing.join(", ")}`,
    );
  }

  if (models.length === 0) return virtualTargets;

  const ids = models.map((item) => item.id);
  const [hostedApis, trainingLinks] = await Promise.all([
    db
      .select()
      .from(modelHostedApi)
      .where(inArray(modelHostedApi.modelId, ids)),
    db
      .select()
      .from(modelTrainingRun)
      .where(inArray(modelTrainingRun.modelId, ids)),
  ]);

  const hostedById = Object.fromEntries(
    hostedApis.map((item) => [item.modelId, item]),
  );
  const trainingById = Object.fromEntries(
    trainingLinks.map((item) => [item.modelId, item]),
  );
  const modelTargets = models.map((item): ModelAdapter => {
    const hosted = hostedById[item.id];
    if (hosted) {
      const adapter = makeGPTAdapter(hosted.apiModelName);
      return { ...adapter, name: item.name };
    }
    if (trainingById[item.id]) {
      if (!item.inferenceEndpoint) {
        return {
          name: item.name,
          targetKey: item.id,
          isStub: true,
          generate: async () => {
            throw new Error(`No inference endpoint for model ${item.name}`);
          },
        };
      }
      return makePiroModelAdapter(item.id, item.name, item.inferenceEndpoint);
    }
    return {
      name: item.name,
      targetKey: item.id,
      isStub: true,
      generate: async () => ({ text: "", inputTokens: 0, outputTokens: 0 }),
    };
  });

  return [...modelTargets, ...virtualTargets];
}

export async function runSuite(
  suiteRunId: string,
  userId: string,
  benchmarkFilter: string[] | null,
  targetFilter: string[] | null,
  context?: BenchmarkContext,
): Promise<void> {
  const benchmarks = benchmarkFilter?.length
    ? BENCHMARKS.filter((benchmark) => benchmarkFilter.includes(benchmark.name))
    : BENCHMARKS;
  const ranAt = new Date();

  try {
    const targets = await resolveTargets(
      userId,
      targetFilter?.length ? targetFilter : null,
    );
    await Promise.all(
      targets.map(async (target) => {
        for (const benchmark of benchmarks) {
          let result;
          try {
            result = await benchmark.run(target, context);
          } catch (error) {
            result = {
              score: 0,
              costUsd: 0,
              durationMs: 0,
              metadata: {
                error: String(error),
                modelName: target.name,
                targetKey: target.targetKey ?? target.name,
              },
            };
          }

          await db.insert(benchmarkRun).values({
            id: crypto.randomUUID(),
            userId,
            suiteRunId,
            benchmarkName: benchmark.name,
            target: target.targetKey ?? target.name,
            score: result.score,
            costUsd: result.costUsd,
            durationMs: result.durationMs,
            metadata: JSON.stringify(result.metadata),
            ranAt,
          });
        }
      }),
    );

    await db
      .update(benchmarkSuiteRun)
      .set({ status: "complete", completedAt: new Date() })
      .where(eq(benchmarkSuiteRun.id, suiteRunId));
  } catch (error) {
    await db
      .update(benchmarkSuiteRun)
      .set({ status: "error", error: String(error), completedAt: new Date() })
      .where(eq(benchmarkSuiteRun.id, suiteRunId));
  }
}
