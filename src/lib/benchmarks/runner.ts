import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../data/db";
import {
  benchmarkRun,
  benchmarkSuiteRun,
  dataset,
  model,
  modelHostedApi,
  modelTrainingRun,
} from "../../../data/schema";
import {
  parseDatasetEvaluationConfig,
  type DatasetEvaluationConfig,
} from "../datasets/evaluation-config";
import { associativeRecall } from "./associative-recall";
import { makeChatAdapter, makePiroModelAdapter } from "./adapters";
import { getBenchmarkTarget } from "./targets";
import type { BenchmarkDef, ModelAdapter } from "./types";

const EVALUATORS: Record<DatasetEvaluationConfig["evaluator"], BenchmarkDef> = {
  associative_recall: associativeRecall,
};

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
      const inputPrice = hosted.inputPricePerMillion;
      const outputPrice = hosted.outputPricePerMillion;
      const hasTokenPricing = inputPrice !== null && outputPrice !== null;
      return makeChatAdapter({
        targetKey: item.id,
        name: item.name,
        endpoint: hosted.endpoint,
        apiModelName: hosted.apiModelName,
        apiKeyEnvVar: hosted.apiKeyEnvVar ?? undefined,
        pricing: hasTokenPricing
          ? {
              inputPerMillion: inputPrice,
              outputPerMillion: outputPrice,
            }
          : undefined,
        tokenAccounting:
          hosted.tokenAccounting === "not_applicable"
            ? "not_applicable"
            : "provider_usage",
        costAccounting: hasTokenPricing ? "token_pricing" : "not_applicable",
      });
    }
    if (trainingById[item.id]) {
      return makePiroModelAdapter(item.id, item.name);
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

export async function runEvaluation(
  suiteRunId: string,
  userId: string,
  datasetId: string,
  targetFilter: string[],
  episodes?: number,
): Promise<void> {
  const ranAt = new Date();

  try {
    if (!targetFilter.length)
      throw new Error("Evaluation targets are required");

    const [datasetRow] = await db
      .select()
      .from(dataset)
      .where(and(eq(dataset.id, datasetId), eq(dataset.userId, userId)))
      .limit(1);
    if (!datasetRow) throw new Error("Evaluation dataset is unavailable");

    const evaluationConfig = parseDatasetEvaluationConfig(
      datasetRow.evaluationConfig,
    );
    if (!evaluationConfig) {
      throw new Error(
        `Dataset ${datasetRow.name} does not define a supported evaluation protocol`,
      );
    }
    const evaluator = EVALUATORS[evaluationConfig.evaluator];
    if (!evaluator) {
      throw new Error(
        `No evaluator is registered for ${evaluationConfig.evaluator}`,
      );
    }

    const targets = await resolveTargets(userId, targetFilter);
    await Promise.all(
      targets.map(async (target) => {
        let result;
        try {
          result = await evaluator.run(target, {
            datasetR2Prefix: datasetRow.r2Prefix,
            evaluationConfig,
            episodes,
          });
        } catch (error) {
          result = {
            score: 0,
            costUsd: null,
            durationMs: 0,
            metadata: {
              error: String(error),
              datasetId,
              datasetName: datasetRow.name,
              evaluator: evaluationConfig.evaluator,
              modelName: target.name,
              targetKey: target.targetKey ?? target.name,
              costAccounting: target.costAccounting ?? "unknown",
            },
          };
        }

        await db.insert(benchmarkRun).values({
          id: crypto.randomUUID(),
          userId,
          suiteRunId,
          datasetId,
          benchmarkName: evaluationConfig.evaluator,
          target: target.targetKey ?? target.name,
          score: result.score,
          costUsd: result.costUsd,
          durationMs: result.durationMs,
          metadata: JSON.stringify({
            datasetId,
            datasetName: datasetRow.name,
            evaluator: evaluationConfig.evaluator,
            costAccounting: target.costAccounting ?? "unknown",
            ...result.metadata,
          }),
          ranAt,
        });
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
