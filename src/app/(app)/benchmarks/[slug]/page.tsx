import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmark, benchmarkRun, benchmarkSuiteRun } from "../../../../../data/schema";
import { buildDefaultBenchmarks } from "~/lib/benchmark-defs";
import { resolveModelTargets } from "~/lib/benchmarks/resolve-models";
import ScorePill from "~/components/ScorePill";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const userId = session.user.id;

  // Lazy-seed defaults if user has no benchmarks yet
  const existingCount = await db
    .select()
    .from(benchmark)
    .where(eq(benchmark.userId, userId));

  if (existingCount.length === 0) {
    await db.insert(benchmark).values(buildDefaultBenchmarks(userId));
  }

  // Find this benchmark by slug
  const [bm] = await db
    .select()
    .from(benchmark)
    .where(and(eq(benchmark.userId, userId), eq(benchmark.slug, slug)))
    .limit(1);

  if (!bm) notFound();

  // Fetch all benchmark_run rows for this slug (one row per model per suite)
  const rawRuns = await db
    .select()
    .from(benchmarkRun)
    .where(and(eq(benchmarkRun.userId, userId), eq(benchmarkRun.benchmarkName, slug)))
    .orderBy(desc(benchmarkRun.ranAt))
    .limit(200);

  // Group by suiteRunId → one entry per suite run
  const suiteMap = new Map<
    string,
    { suiteRunId: string; ranAt: Date; results: { target: string; score: number }[] }
  >();
  for (const r of rawRuns) {
    const existing = suiteMap.get(r.suiteRunId);
    if (!existing) {
      suiteMap.set(r.suiteRunId, {
        suiteRunId: r.suiteRunId,
        ranAt: r.ranAt,
        results: [{ target: r.target, score: r.score }],
      });
    } else {
      existing.results.push({ target: r.target, score: r.score });
      if (r.ranAt < existing.ranAt) existing.ranAt = r.ranAt;
    }
  }
  // Sorted newest-first (Map iteration order preserved from desc query, but re-sort to be safe)
  const suiteGroups = [...suiteMap.values()].sort(
    (a, b) => b.ranAt.getTime() - a.ranAt.getTime(),
  );

  // Fetch queued suite runs, filter to those that include this benchmark
  const queuedSuites = await db
    .select()
    .from(benchmarkSuiteRun)
    .where(and(eq(benchmarkSuiteRun.userId, userId), eq(benchmarkSuiteRun.status, "queued")));

  const inProgressSuites = queuedSuites.filter((s) => {
    if (!s.benchmarks) return true; // null = all benchmarks = includes this one
    try {
      const arr = JSON.parse(s.benchmarks) as string[];
      return arr.length === 0 || arr.includes(slug);
    } catch {
      return false;
    }
  });

  // Resolve model target UUIDs → display names
  const allTargets = rawRuns.map((r) => r.target);
  const { nameMap } = await resolveModelTargets(allTargets);

  // Parse configJson for display
  let configParams: Record<string, unknown> = {};
  if (bm.configJson) {
    try {
      configParams = JSON.parse(bm.configJson) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  const hasHistory = inProgressSuites.length > 0 || suiteGroups.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/benchmarks"
            className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-amber-100 font-bold text-sm tracking-tight">{bm.name}</h1>
            <p className="text-[11px] text-amber-400/40 mt-0.5 font-mono">{bm.slug}</p>
          </div>
        </div>

        {/* New run button */}
        <Link
          href={`/benchmarks/new?benchmark=${encodeURIComponent(bm.slug)}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New run
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Benchmark info card */}
          <div className="rounded-xl border border-amber-900/20 bg-amber-900/5 px-4 py-3 space-y-2.5">
            {bm.description && (
              <p className="text-xs text-amber-400/60 leading-relaxed">{bm.description}</p>
            )}
            {Object.keys(configParams).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(configParams).map(([k, v]) => (
                  <span
                    key={k}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-amber-900/25 bg-amber-900/10 text-amber-600/50"
                  >
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Run history */}
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50 mb-3 px-1">
              Run history
            </h2>

            {!hasHistory ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-amber-800/40 mb-3"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <p className="text-sm font-semibold text-amber-200/60">No runs yet</p>
                <p className="text-xs text-amber-600/40 mt-1">
                  Hit{" "}
                  <Link
                    href={`/benchmarks/new?benchmark=${encodeURIComponent(bm.slug)}`}
                    className="text-orange-400/60 hover:text-orange-300/70 transition-colors"
                  >
                    New run
                  </Link>{" "}
                  to evaluate your models.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* In-progress suite runs */}
                {inProgressSuites.map((s) => (
                  <Link
                    key={s.id}
                    href={`/benchmarks/runs/${s.id}?from=${encodeURIComponent(slug)}`}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border border-amber-700/25 bg-amber-900/8 hover:bg-amber-900/12 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className="animate-spin w-3 h-3 text-amber-400/70"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-xs text-amber-400/70 font-medium">In progress</span>
                    </div>
                    <span className="text-[10px] text-amber-700/35">{timeAgo(s.queuedAt)}</span>
                  </Link>
                ))}

                {/* Completed suite runs — one card per suite, scores per model inline */}
                {suiteGroups.map((g) => (
                  <Link
                    key={g.suiteRunId}
                    href={`/benchmarks/runs/${g.suiteRunId}?from=${encodeURIComponent(slug)}`}
                    className="block px-4 py-3 rounded-xl border border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-[10px] text-amber-700/35">{timeAgo(g.ranAt)}</span>
                      <svg className="w-4 h-4 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      {g.results.map((r) => (
                        <div key={r.target} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-amber-300/60 truncate">
                            {nameMap[r.target] ?? r.target}
                          </span>
                          <ScorePill score={r.score} />
                        </div>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
