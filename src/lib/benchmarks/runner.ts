import { eq } from "drizzle-orm";
import { db } from "../../../data/db";
import { benchmarkRun, benchmarkSuiteRun } from "../../../data/schema";
import type { BenchmarkDef, ModelAdapter } from "./types";
import { sanityCheck } from "./sanity-check";
import { oodGeneralization } from "./ood-generalization";
import { adaptiveCompute } from "./adaptive-compute";
import { makeGPTAdapter, makePiroStudentAdapter } from "./openai";

// ── Registry ──────────────────────────────────────────────────────────────────

export const BENCHMARKS: BenchmarkDef[] = [
  sanityCheck,
  oodGeneralization,
  adaptiveCompute,
];

export const TARGETS: ModelAdapter[] = [
  makeGPTAdapter("gpt-4o-mini"),
  makeGPTAdapter("gpt-4o"),
  makePiroStudentAdapter(),
];

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

  const targets = targetFilter?.length
    ? TARGETS.filter((t) => targetFilter.includes(t.name))
    : TARGETS;

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
              passed: false,
              threshold: benchmark.threshold,
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
            threshold: result.threshold,
            passed: result.passed,
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
