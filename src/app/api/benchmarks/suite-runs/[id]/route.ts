import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { benchmarkSuiteRun, benchmarkRun } from "../../../../../../data/schema";

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

  return NextResponse.json({
    suite: {
      id: suite.id,
      status: suite.status,
      benchmarks: suite.benchmarks,
      targets: suite.targets,
      queuedAt: suite.queuedAt.toISOString(),
      completedAt: suite.completedAt?.toISOString() ?? null,
      error: suite.error,
      results: results.map((r) => ({
        id: r.id,
        benchmarkName: r.benchmarkName,
        target: r.target,
        score: r.score,
        threshold: r.threshold,
        passed: r.passed,
        durationMs: r.durationMs,
        metadata: r.metadata,
        ranAt: r.ranAt.toISOString(),
      })),
    },
  });
}
