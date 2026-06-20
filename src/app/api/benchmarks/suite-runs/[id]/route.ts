import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { benchmarkSuiteRun, benchmarkRun } from "../../../../../../data/schema";
import { resolveModelTargets } from "~/lib/benchmarks/resolve-models";

// ── GET /api/benchmarks/suite-runs/[id] ──────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [suite] = await db
    .select()
    .from(benchmarkSuiteRun)
    .where(
      and(
        eq(benchmarkSuiteRun.id, id),
        eq(benchmarkSuiteRun.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!suite)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const results = await db
    .select()
    .from(benchmarkRun)
    .where(eq(benchmarkRun.suiteRunId, id))
    .orderBy(desc(benchmarkRun.ranAt));

  // Resolve any UUID targets → model names (handles runs created before the fix)
  const suiteTargetIds: string[] = suite.targets
    ? (JSON.parse(suite.targets) as string[])
    : [];
  const allRawTargets = [...suiteTargetIds, ...results.map((r) => r.target)];
  const { nameMap, stubNames } = await resolveModelTargets(allRawTargets);

  return NextResponse.json({
    suite: {
      id: suite.id,
      status: suite.status,
      benchmarks: suite.benchmarks,
      targets: suiteTargetIds.map((id) => nameMap[id] ?? id),
      stubs: [...stubNames],
      queuedAt: suite.queuedAt.toISOString(),
      completedAt: suite.completedAt?.toISOString() ?? null,
      error: suite.error,
      results: results.map((r) => ({
        id: r.id,
        benchmarkName: r.benchmarkName,
        target: nameMap[r.target] ?? r.target,
        score: r.score,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
        metadata: r.metadata,
        ranAt: r.ranAt.toISOString(),
      })),
    },
  });
}
