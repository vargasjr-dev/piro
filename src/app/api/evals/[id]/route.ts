import { and, eq } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmarkRun, benchmarkSuiteRun } from "../../../../../data/schema";
import { resolveRequestUserId } from "~/lib/evals/auth";

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await resolveRequestUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [suite] = await db
    .select()
    .from(benchmarkSuiteRun)
    .where(
      and(eq(benchmarkSuiteRun.id, id), eq(benchmarkSuiteRun.userId, userId)),
    )
    .limit(1);
  if (!suite)
    return Response.json({ error: "Evaluation not found" }, { status: 404 });

  const results = await db
    .select()
    .from(benchmarkRun)
    .where(
      and(eq(benchmarkRun.suiteRunId, id), eq(benchmarkRun.userId, userId)),
    );
  const totalCostUsd = results.reduce(
    (sum, result) => sum + (result.costUsd ?? 0),
    0,
  );
  const totalDurationMs = results.reduce(
    (sum, result) => sum + (result.durationMs ?? 0),
    0,
  );

  return Response.json({
    id: suite.id,
    status: suite.status,
    benchmarks: parseJson(suite.benchmarks),
    targets: parseJson(suite.targets),
    queuedAt: suite.queuedAt.toISOString(),
    completedAt: suite.completedAt?.toISOString() ?? null,
    error: suite.error,
    results: results.map((result) => {
      const metadata = parseJson(result.metadata) as Record<
        string,
        unknown
      > | null;
      return {
        benchmarkName: result.benchmarkName,
        target: result.target,
        modelName: metadata?.modelName ?? result.target,
        score: result.score,
        costUsd: result.costUsd ?? 0,
        durationMs: result.durationMs ?? 0,
        inputTokens:
          typeof metadata?.inputTokens === "number"
            ? metadata.inputTokens
            : null,
        outputTokens:
          typeof metadata?.outputTokens === "number"
            ? metadata.outputTokens
            : null,
        tokenAccounting: metadata?.tokenAccounting ?? "unknown",
        metadata,
      };
    }),
    summary: { totalCostUsd, totalDurationMs },
  });
}
