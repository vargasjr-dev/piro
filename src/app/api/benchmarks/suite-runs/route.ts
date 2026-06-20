import { NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmarkSuiteRun, benchmarkRun } from "../../../../../data/schema";
import { resolveModelTargets } from "~/lib/benchmarks/resolve-models";

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

  // Resolve any UUID targets → model names (handles runs created before the fix)
  const allResults = Object.values(resultsBySuite).flat();
  const allRawTargets = [
    ...suites.flatMap((s) =>
      s.targets ? (JSON.parse(s.targets) as string[]) : [],
    ),
    ...allResults.map((r) => r.target),
  ];
  const { nameMap, stubNames } = await resolveModelTargets(allRawTargets);

  return NextResponse.json({
    suites: suites.map((s) => {
      const suiteTargetIds: string[] = s.targets
        ? (JSON.parse(s.targets) as string[])
        : [];
      const results = resultsBySuite[s.id] ?? [];
      return {
        id: s.id,
        status: s.status,
        benchmarks: s.benchmarks,
        targets: suiteTargetIds.map((id) => nameMap[id] ?? id),
        stubs: [...stubNames],
        queuedAt: s.queuedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        error: s.error,
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
      };
    }),
  });
}
