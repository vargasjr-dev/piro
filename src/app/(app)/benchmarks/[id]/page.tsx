import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmarkSuiteRun, benchmarkRun } from "../../../../../data/schema";
import RunDetail from "./RunDetail";

export default async function BenchmarkRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

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

  if (!suite) notFound();

  const results = await db
    .select()
    .from(benchmarkRun)
    .where(eq(benchmarkRun.suiteRunId, id));

  const run = {
    id: suite.id,
    status: suite.status as "queued" | "complete" | "error",
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
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link
          href="/benchmarks"
          className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Benchmark Run</h1>
          <p className="text-[11px] text-amber-400/40 mt-0.5 font-mono">{suite.id.slice(0, 8)}…</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <RunDetail run={run} />
      </div>
    </div>
  );
}
