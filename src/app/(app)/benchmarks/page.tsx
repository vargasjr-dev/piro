import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../../../../data/db";
import { benchmarkSuiteRun, benchmarkRun } from "../../../../data/schema";
import RunsList from "./RunsList";

export default async function BenchmarksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const suites = await db
    .select()
    .from(benchmarkSuiteRun)
    .where(eq(benchmarkSuiteRun.userId, session.user.id))
    .orderBy(desc(benchmarkSuiteRun.queuedAt))
    .limit(50);

  // Fetch results for completed suites
  const completedIds = suites.filter((s) => s.status === "complete").map((s) => s.id);
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

  const initialSuites = suites.map((s) => ({
    id: s.id,
    status: s.status as "queued" | "complete" | "error",
    benchmarks: s.benchmarks,
    targets: s.targets,
    queuedAt: s.queuedAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    error: s.error,
    results: (resultsBySuite[s.id] ?? []).map((r) => ({
      id: r.id,
      benchmarkName: r.benchmarkName,
      target: r.target,
      score: r.score,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      metadata: r.metadata,
      ranAt: r.ranAt.toISOString(),
    })),
  }));

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Benchmarks</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">Track model capability across runs</p>
        </div>
        <Link
          href="/benchmarks/new"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New run
        </Link>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        <RunsList initialSuites={initialSuites} />
      </div>
    </div>
  );
}
