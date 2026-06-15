import { NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmarkSuiteRun, benchmarkRun } from "../../../../../data/schema";

// ── GET /api/benchmarks/suite-runs — list recent suite runs with result counts ─

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suites = await db
    .select()
    .from(benchmarkSuiteRun)
    .where(eq(benchmarkSuiteRun.userId, session.user.id))
    .orderBy(desc(benchmarkSuiteRun.queuedAt))
    .limit(50);

  // Fetch results for completed suites
  const completedIds = suites
    .filter((s) => s.status === "complete")
    .map((s) => s.id);

  const resultsBySuite: Record<string, typeof benchmarkRun.$inferSelect[]> = {};
  if (completedIds.length > 0) {
    const allResults = await db
      .select()
      .from(benchmarkRun)
      .where(inArray(benchmarkRun.suiteRunId, completedIds))
      .orderBy(desc(benchmarkRun.ranAt));

    for (const r of allResults) {
      if (!resultsBySuite[r.suiteRunId]) resultsBySuite[r.suiteRunId] = [];
      resultsBySuite[r.suiteRunId].push(r);
    }
  }

  return NextResponse.json({
    suites: suites.map((s) => ({
      ...s,
      results: resultsBySuite[s.id] ?? [],
    })),
  });
}
