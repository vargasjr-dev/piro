import { desc, eq, and } from "drizzle-orm";
import { db } from "../../../../data/db";
import {
  benchmarkRun,
  benchmarkSuiteRun,
  dataset,
} from "../../../../data/schema";
import { resolveRequestUserId } from "~/lib/evals/auth";
import { runEvaluation } from "~/lib/benchmarks/runner";
import { waitUntil } from "@vercel/functions";

export async function GET(request: Request) {
  const userId = await resolveRequestUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(benchmarkSuiteRun)
    .where(eq(benchmarkSuiteRun.userId, userId))
    .orderBy(desc(benchmarkSuiteRun.queuedAt))
    .limit(50);
  const runIds = rows.map((row) => row.id);
  const resultRows = runIds.length
    ? await db
        .select()
        .from(benchmarkRun)
        .where(eq(benchmarkRun.userId, userId))
    : [];
  const resultsByRun = new Map<string, typeof resultRows>();
  for (const result of resultRows) {
    if (!runIds.includes(result.suiteRunId)) continue;
    const existing = resultsByRun.get(result.suiteRunId) ?? [];
    existing.push(result);
    resultsByRun.set(result.suiteRunId, existing);
  }

  return Response.json({
    evals: rows.map((row) => ({
      id: row.id,
      status: row.status,
      benchmarks: row.benchmarks ? JSON.parse(row.benchmarks) : null,
      targets: row.targets ? JSON.parse(row.targets) : null,
      queuedAt: row.queuedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      resultCount: resultsByRun.get(row.id)?.length ?? 0,
      totalCostUsd: (resultsByRun.get(row.id) ?? []).reduce(
        (sum, result) => sum + (result.costUsd ?? 0),
        0,
      ),
      totalDurationMs: (resultsByRun.get(row.id) ?? []).reduce(
        (sum, result) => sum + (result.durationMs ?? 0),
        0,
      ),
      results: (resultsByRun.get(row.id) ?? []).map((result) => {
        const metadata = result.metadata
          ? (JSON.parse(result.metadata) as Record<string, unknown>)
          : null;
        return {
          target: result.target,
          inputTokens:
            typeof metadata?.inputTokens === "number"
              ? metadata.inputTokens
              : null,
          outputTokens:
            typeof metadata?.outputTokens === "number"
              ? metadata.outputTokens
              : null,
          tokenAccounting: metadata?.tokenAccounting ?? "unknown",
        };
      }),
    })),
  });
}

export async function POST(request: Request) {
  const userId = await resolveRequestUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    targets?: string[];
    datasetId?: string;
    episodes?: number;
  };
  const datasetId = body.datasetId?.trim();
  if (!datasetId) {
    return Response.json({ error: "datasetId is required" }, { status: 400 });
  }
  if (!body.targets?.length) {
    return Response.json(
      { error: "targets must contain at least one model target" },
      { status: 400 },
    );
  }

  const [datasetRow] = await db
    .select({ id: dataset.id })
    .from(dataset)
    .where(and(eq(dataset.id, datasetId), eq(dataset.userId, userId)))
    .limit(1);
  if (!datasetRow) {
    return Response.json({ error: "Evaluation dataset not found" }, { status: 404 });
  }

  const requestedTargets = body.targets;
  const suiteRunId = crypto.randomUUID();
  await db.insert(benchmarkSuiteRun).values({
    id: suiteRunId,
    userId,
    datasetId,
    status: "queued",
    benchmarks: null,
    targets: JSON.stringify(requestedTargets),
  });
  waitUntil(
    runEvaluation(suiteRunId, userId, datasetId, requestedTargets, body.episodes),
  );

  return Response.json(
    { id: suiteRunId, status: "queued", datasetId },
    { status: 202 },
  );
}
