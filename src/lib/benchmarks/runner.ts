import { eq, inArray } from "drizzle-orm";
import { db } from "../../../data/db";
import {
  benchmarkRun,
  benchmarkSuiteRun,
  model,
  modelHostedApi,
  modelTrainingRun,
} from "../../../data/schema";
import type { BenchmarkDef, ModelAdapter } from "./types";
import { sanityCheck } from "./sanity-check";
import { oodGeneralization } from "./ood-generalization";
import { adaptiveCompute } from "./adaptive-compute";
import { makeGPTAdapter, makePiroModelAdapter } from "./openai";

// ── Benchmark registry (static) ───────────────────────────────────────────────

export const BENCHMARKS: BenchmarkDef[] = [
  sanityCheck,
  oodGeneralization,
  adaptiveCompute,
];

// ── Dynamic target resolution from DB ────────────────────────────────────────

/**
 * Build ModelAdapter instances for the given model IDs (or all models for userId
 * if targetIds is null). Resolves each model's type from DB:
 *  - modelHostedApi  → makeGPTAdapter(apiModelName)
 *  - modelTrainingRun → makePiroStudentAdapter keyed by model.id
 */
async function resolveTargets(
  userId: string,
  targetIds: string[] | null,
): Promise<ModelAdapter[]> {
  const models = targetIds?.length
    ? await db.select({ id: model.id, name: model.name, inferenceEndpoint: model.inferenceEndpoint }).from(model).where(inArray(model.id, targetIds))
    : await db.select({ id: model.id, name: model.name, inferenceEndpoint: model.inferenceEndpoint }).from(model).where(eq(model.userId, userId));

  if (models.length === 0) return [];

  const ids = models.map((m) => m.id);

  const [hostedApis, trainingLinks] = await Promise.all([
    db.select().from(modelHostedApi).where(inArray(modelHostedApi.modelId, ids)),
    db.select().from(modelTrainingRun).where(inArray(modelTrainingRun.modelId, ids)),
  ]);

  const hostedById = Object.fromEntries(hostedApis.map((h) => [h.modelId, h]));
  const trainingById = Object.fromEntries(trainingLinks.map((t) => [t.modelId, t]));

  return models.map((m): ModelAdapter => {
    const hosted = hostedById[m.id];
    if (hosted) {
      // Hosted API model — route through provider
      return makeGPTAdapter(hosted.apiModelName);
    }
    if (trainingById[m.id]) {
      if (!m.inferenceEndpoint) {
        // Trained before weight/endpoint persistence — mark as stub so results aren't shown as real
        return {
          name: m.name,
          isStub: true,
          generate: async () => { throw new Error(`No inference endpoint for model ${m.name} — retrain to enable inference`); },
        };
      }
      return makePiroModelAdapter(m.id, m.name, m.inferenceEndpoint);
    }
    // Fallback stub
    return {
      name: m.name,
      isStub: true,
      generate: async () => ({ text: "", inputTokens: 0, outputTokens: 0 }),
    };
  });
}

// ── Suite runner ──────────────────────────────────────────────────────────────

/**
 * Run a subset of benchmarks against a subset of targets.
 * Writes each result to DB immediately. Marks the suite run complete (or error)
 * when done. Designed to be called inside waitUntil().
 *
 * @param suiteRunId   ID of the benchmark_suite_run row (already created)
 * @param userId       Owner — written onto each benchmark_run row
 * @param benchmarkFilter  null = all; string[] = names to include
 * @param targetFilter     null = all; string[] = model names to include
 */
export async function runSuite(
  suiteRunId: string,
  userId: string,
  benchmarkFilter: string[] | null,
  targetFilter: string[] | null,
): Promise<void> {
  const benchmarks = benchmarkFilter?.length
    ? BENCHMARKS.filter((b) => benchmarkFilter.includes(b.name))
    : BENCHMARKS;

  // targetFilter is now a list of model UUIDs (or null = all)
  const targets = await resolveTargets(userId, targetFilter?.length ? targetFilter : null);

  const ranAt = new Date();

  try {
    // Run each target in parallel; within each target, run benchmarks sequentially
    // (keeps OpenAI concurrency bounded to n_targets while still being fast)
    await Promise.all(
      targets.map(async (target) => {
        for (const benchmark of benchmarks) {
          let result;
          try {
            result = await benchmark.run(target);
          } catch (e) {
            // Individual benchmark failure — record a zero score with error metadata
            result = {
              score: 0,
              costUsd: 0,
              durationMs: 0,
              metadata: { error: String(e) },
            };
          }

          await db.insert(benchmarkRun).values({
            id: crypto.randomUUID(),
            userId,
            suiteRunId,
            benchmarkName: benchmark.name,
            target: target.name,
            score: result.score,
            costUsd: result.costUsd,
            durationMs: result.durationMs,
            metadata: JSON.stringify(result.metadata),
            ranAt,
          });
        }
      }),
    );

    // Mark suite complete
    await db
      .update(benchmarkSuiteRun)
      .set({ status: "complete", completedAt: new Date() })
      .where(eq(benchmarkSuiteRun.id, suiteRunId));
  } catch (e) {
    await db
      .update(benchmarkSuiteRun)
      .set({ status: "error", error: String(e), completedAt: new Date() })
      .where(eq(benchmarkSuiteRun.id, suiteRunId));
  }
}
