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
import { associativeRecall } from "./associative-recall";
import { makeChatAdapter, makePiroModelAdapter } from "./adapters";
import { getBenchmarkTarget, getHostedTargetConfig } from "./targets";

export const BENCHMARKS: BenchmarkDef[] = [
  sanityCheck,
  oodGeneralization,
  adaptiveCompute,
  associativeRecall,
];

async function resolveTargets(
  userId: string,
  targetIds: string[],
): Promise<ModelAdapter[]> {
  const virtualTargets = targetIds
    .filter((target) => getBenchmarkTarget(target))
    .map((target) => makeChatAdapter(getBenchmarkTarget(target)!));
  const requestedModelIds = targetIds.filter(
    (target) => !getBenchmarkTarget(target),
  );

  const models = requestedModelIds.length
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
    : [];

  if (models.length !== requestedModelIds.length) {
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
      const config = getHostedTargetConfig({
        targetKey: item.id,
        name: item.name,
        endpoint: hosted.endpoint,
        apiModelName: hosted.apiModelName,
        apiKeyEnvVar: hosted.apiKeyEnvVar ?? undefined,
        pricing:
          hosted.inputPricePerMillion === null ||
          hosted.outputPricePerMillion === null
            ? undefined
            : {
                inputPerMillion: hosted.inputPricePerMillion,
                outputPerMillion: hosted.outputPricePerMillion,
              },
        tokenAccounting:
          hosted.tokenAccounting === "not_applicable"
            ? "not_applicable"
            : "provider_usage",
      });
      return makeChatAdapter(config);
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
    if (!targetFilter?.length) {
      throw new Error("Evaluation targets are required");
    }
    const targets = await resolveTargets(userId, targetFilter);
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
