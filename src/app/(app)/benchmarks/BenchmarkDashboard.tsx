"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunRow {
  id: string;
  suiteRunId: string;
  benchmarkName: string;
  target: string;
  score: number;
  threshold: number;
  passed: boolean;
  durationMs: number | null;
  metadata: string | null;
  ranAt: string | Date;
}

const TARGETS = ["gpt-4o-mini", "gpt-4o", "piro-student"] as const;

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

function ScorePill({ score, passed }: { score: number; passed: boolean }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-md
        ${passed
          ? "bg-emerald-900/30 text-emerald-400/80 border border-emerald-800/30"
          : "bg-red-900/25 text-red-400/70 border border-red-800/25"
        }
      `}
    >
      {passed ? "✓" : "✗"} {score.toFixed(3)}
    </span>
  );
}

// ── Benchmark card (in the left list) ────────────────────────────────────────

function BenchmarkCard({
  name,
  latestByTarget,
  selected,
  onClick,
}: {
  name: string;
  latestByTarget: Record<string, RunRow | undefined>;
  selected: boolean;
  onClick: () => void;
}) {
  const runs = TARGETS.map((t) => latestByTarget[t]).filter(Boolean) as RunRow[];
  const passCount = runs.filter((r) => r.passed).length;
  const mostRecent = runs.reduce<RunRow | null>((a, b) => {
    if (!a) return b;
    return new Date(b.ranAt) > new Date(a.ranAt) ? b : a;
  }, null);

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border px-4 py-3.5 transition-all
        ${selected
          ? "border-orange-500/40 bg-orange-500/8"
          : "border-amber-900/25 bg-amber-900/5 hover:border-amber-800/40 hover:bg-amber-900/10"
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-amber-100 truncate">{name}</p>
        {runs.length > 0 && (
          <span className="shrink-0 text-[10px] text-amber-600/40">
            {passCount}/{runs.length} targets passing
          </span>
        )}
      </div>

      {runs.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {TARGETS.map((t) => {
            const r = latestByTarget[t];
            if (!r) return (
              <span key={t} className="text-[10px] text-amber-700/30 italic">{t}: —</span>
            );
            return (
              <div key={t} className="flex items-center gap-1">
                <span className="text-[10px] text-amber-600/40">{t}:</span>
                <ScorePill score={r.score} passed={r.passed} />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-amber-600/30 mt-1.5 italic">No runs yet</p>
      )}

      {mostRecent && (
        <p className="text-[10px] text-amber-700/30 mt-2">
          Last run {timeAgo(new Date(mostRecent.ranAt))}
        </p>
      )}
    </button>
  );
}

// ── Run history panel (right side) ───────────────────────────────────────────

interface HistoryRun extends RunRow {
  parsedMeta?: Record<string, unknown>;
}

function RunHistoryPanel({
  benchmarkName,
  onBack,
}: {
  benchmarkName: string;
  onBack: () => void;
}) {
  const [runs, setRuns] = useState<HistoryRun[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/benchmark-runs/history?benchmark=${encodeURIComponent(benchmarkName)}&limit=60`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { runs: RunRow[] };
      setRuns(
        data.runs.map((r) => ({
          ...r,
          parsedMeta: r.metadata ? JSON.parse(r.metadata) : undefined,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [benchmarkName]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by suiteRunId, then by target within each suite
  const suiteMap = new Map<string, HistoryRun[]>();
  for (const r of runs ?? []) {
    const arr = suiteMap.get(r.suiteRunId) ?? [];
    arr.push(r);
    suiteMap.set(r.suiteRunId, arr);
  }
  // Sort suites newest-first
  const suites = [...suiteMap.entries()].sort(
    ([, a], [, b]) =>
      new Date(b[0].ranAt).getTime() - new Date(a[0].ranAt).getTime(),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-900/20 shrink-0">
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-900/30 text-amber-400/50 hover:text-amber-200 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <h3 className="text-sm font-bold text-amber-50 leading-none">{benchmarkName}</h3>
          <p className="text-xs text-amber-400/40 mt-0.5">Run history across all targets</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-amber-600/35 text-xs py-4">
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" strokeLinecap="round" />
            </svg>
            Loading history…
          </div>
        ) : suites.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-amber-200/40">No runs recorded yet.</p>
            <p className="text-xs text-amber-600/30 mt-1 max-w-xs mx-auto">
              Run <code className="font-mono text-orange-400/60">bun run bench --post-url &lt;url&gt;</code> to record results.
            </p>
          </div>
        ) : (
          suites.map(([suiteRunId, suiteRuns]) => {
            const ranAt = new Date(suiteRuns[0].ranAt);
            return (
              <div key={suiteRunId} className="rounded-xl border border-amber-900/20 overflow-hidden">
                {/* Suite header */}
                <div className="px-3 py-2 bg-amber-900/10 border-b border-amber-900/15 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-amber-400/50">
                    Suite run
                  </span>
                  <span className="text-[10px] text-amber-600/35">{timeAgo(ranAt)}</span>
                </div>

                {/* Per-target rows */}
                <div className="divide-y divide-amber-900/10">
                  {TARGETS.map((target) => {
                    const r = suiteRuns.find((x) => x.target === target);
                    if (!r) return null;
                    const meta = r.parsedMeta;
                    return (
                      <div key={target} className="px-3 py-2.5 flex items-start gap-3">
                        <div className="w-28 shrink-0">
                          <p className="text-[10px] text-amber-400/50 font-medium">{target}</p>
                          {r.durationMs !== null && (
                            <p className="text-[9px] text-amber-700/30">
                              {(r.durationMs / 1000).toFixed(1)}s
                            </p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <ScorePill score={r.score} passed={r.passed} />
                          {/* OOD-specific detail */}
                          {meta && "test_length" in meta && (
                            <p className="text-[10px] text-amber-600/35 mt-1">
                              {String(meta.n_correct)}/{String(meta.n_samples)} correct at length {String(meta.test_length)}
                            </p>
                          )}
                          {/* Failure examples */}
                          {meta && Array.isArray((meta as { failure_examples?: unknown[] }).failure_examples) &&
                            ((meta as { failure_examples: string[] }).failure_examples).slice(0, 2).map((f: string, i: number) => (
                              <p key={i} className="text-[9px] text-red-400/40 font-mono mt-0.5 truncate">✗ {f}</p>
                            ))
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: how to create a new run */}
      <div className="px-5 pb-5 pt-3 shrink-0 border-t border-amber-900/20">
        <p className="text-[10px] text-amber-700/35 leading-relaxed">
          To record a new run, run the benchmark script with your session token:
        </p>
        <code className="block mt-1.5 text-[10px] text-orange-400/60 font-mono bg-amber-900/15 rounded-lg px-3 py-2 break-all">
          bun run bench --post-url https://piro-henna.vercel.app --post-token &lt;token&gt;
        </code>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[240px] text-center px-6">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-800/40 mb-4">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
      <p className="text-sm font-semibold text-amber-200/60">No benchmark data yet</p>
      <p className="text-xs text-amber-600/40 mt-1 max-w-xs">
        Run the benchmark script with <code className="font-mono text-orange-400/60">--post-url</code> to
        start recording results here.
      </p>
      <div className="mt-4 bg-amber-900/15 border border-amber-900/25 rounded-xl px-4 py-3 text-left max-w-sm">
        <p className="text-[10px] text-amber-600/40 mb-1.5">Quick start:</p>
        <code className="text-[10px] text-orange-400/60 font-mono leading-relaxed">
          bun run bench --dry-run --post-url https://piro-henna.vercel.app --post-token &lt;token&gt;
        </code>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function BenchmarkDashboard({
  benchmarkNames,
  latestRuns,
}: {
  benchmarkNames: string[];
  latestRuns: RunRow[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // Build latestByTarget lookup: benchmarkName → target → RunRow
  const latestMap: Record<string, Record<string, RunRow>> = {};
  for (const r of latestRuns) {
    if (!latestMap[r.benchmarkName]) latestMap[r.benchmarkName] = {};
    latestMap[r.benchmarkName][r.target] = r;
  }

  const showPanel = selected !== null;

  if (benchmarkNames.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex h-full">
      {/* Left: benchmark list */}
      <div
        className={`
          flex flex-col border-r border-amber-900/20 overflow-y-auto
          ${showPanel ? "w-72 shrink-0 hidden lg:flex" : "flex-1"}
        `}
      >
        <div className="px-5 py-3.5 border-b border-amber-900/15 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/40">
            {benchmarkNames.length} benchmark{benchmarkNames.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          {benchmarkNames.map((name) => (
            <BenchmarkCard
              key={name}
              name={name}
              latestByTarget={latestMap[name] ?? {}}
              selected={selected === name}
              onClick={() => setSelected((prev) => (prev === name ? null : name))}
            />
          ))}
        </div>
      </div>

      {/* Right: history panel */}
      {showPanel && (
        <div className="flex-1 overflow-y-auto">
          <RunHistoryPanel
            benchmarkName={selected}
            onBack={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
