import { desc, eq, and } from "drizzle-orm";
import { db } from "../../../../data/db";
import {
  benchmarkRun,
  benchmarkSuiteRun,
  dataset,
} from "../../../../data/schema";
import { resolveRequestUserId } from "~/lib/evals/auth";
import { runSuite } from "~/lib/benchmarks/runner";
import { waitUntil } from "@vercel/functions";
import { GEMMA_TARGET } from "~/lib/benchmarks/gemma";

const ASHFALL_MODEL_ID = "836ecce4-e53a-41b2-a95e-e2e75a98f6db";
const ASHFALL_TARGETS = ["openai:gpt-5-nano", GEMMA_TARGET];

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
    name?: string;
    targets?: string[];
    datasetId?: string;
    episodes?: number;
  };
  const name = body.name?.trim() ?? "";
  if (name.toLowerCase() !== "ashfall") {
    return Response.json(
      { error: "Only the Ashfall benchmark is currently available" },
      { status: 400 },
    );
  }

  const [datasetRow] = await db
    .select({ id: dataset.id, r2Prefix: dataset.r2Prefix })
    .from(dataset)
    .where(
      and(
        eq(
          dataset.id,
          body.datasetId ?? "6c572406-7cd8-4692-94ff-2af04b2d46df",
        ),
        eq(dataset.userId, userId),
      ),
    )
    .limit(1);
  if (!datasetRow)
    return Response.json(
      { error: "Ashfall dataset not found" },
      { status: 404 },
    );

  const requestedTargets = body.targets?.length
    ? body.targets
    : [ASHFALL_MODEL_ID, ...ASHFALL_TARGETS];
  const suiteRunId = crypto.randomUUID();
  await db.insert(benchmarkSuiteRun).values({
    id: suiteRunId,
    userId,
    status: "queued",
    benchmarks: JSON.stringify(["Ashfall"]),
    targets: JSON.stringify(requestedTargets),
  });
  waitUntil(
    runSuite(suiteRunId, userId, ["Ashfall"], requestedTargets, {
      datasetR2Prefix: datasetRow.r2Prefix,
      episodes: body.episodes,
    }),
  );

  return Response.json(
    { id: suiteRunId, status: "queued", benchmark: "Ashfall" },
    { status: 202 },
  );
}
