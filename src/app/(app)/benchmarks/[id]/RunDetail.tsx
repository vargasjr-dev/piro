"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BenchmarkRunRow {
  id: string;
  benchmarkName: string;
  target: string;
  score: number;
  costUsd: number | null;
  durationMs: number | null;
  metadata: string | null;
  ranAt: string;
}

interface SuiteRun {
  id: string;
  status: "queued" | "complete" | "error";
  benchmarks: string | null;
  targets: string | null;
  queuedAt: string;
  completedAt: string | null;
  error: string | null;
  results: BenchmarkRunRow[];
}

// ── Metadata types per benchmark ─────────────────────────────────────────────

interface OODMeta {
  n_tests: number;
  n_correct: number;
  failure_examples: string[];
}

interface AdaptiveMeta {
  easy_correct: number;
  easy_total: number;
  hard_correct: number;
  hard_total: number;
  avg_easy_ms: number;
  avg_hard_ms: number;
  latency_ratio: number | null;
  failure_examples: string[];
}

interface SanityMeta {
  response: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtCost(usd: number | null): string | null {
  if (usd === null) return null;
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return "<$0.0001";
  return `$${usd.toFixed(4)}`;
}

// ── Score pill ────────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center text-xs font-mono font-semibold px-2 py-0.5 rounded-lg bg-amber-900/20 text-amber-300/80 border border-amber-800/25">
      {score.toFixed(3)}
    </span>
  );
}

// ── Benchmark metadata detail ─────────────────────────────────────────────────

function OODDetail({ meta }: { meta: OODMeta }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-6 text-xs">
        <span className="text-amber-600/40">tests run</span>
        <span className="text-amber-300/70 font-mono">{meta.n_tests}</span>
        <span className="text-amber-600/40">correct</span>
        <span className="text-amber-300/70 font-mono">{meta.n_correct}</span>
      </div>
      {meta.failure_examples.length > 0 && (
        <div>
          <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-1.5">Failures</p>
          <div className="space-y-1">
            {meta.failure_examples.map((f, i) => (
              <p key={i} className="text-[11px] font-mono text-red-400/50 bg-red-900/10 rounded px-2 py-1 leading-snug">
                {f}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdaptiveDetail({ meta }: { meta: AdaptiveMeta }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-900/10 rounded-lg px-3 py-2.5">
          <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-1">Easy</p>
          <p className="text-sm font-semibold text-amber-200/80">
            {meta.easy_correct}/{meta.easy_total}
            <span className="text-xs font-normal text-amber-600/40 ml-1.5">
              ({Math.round((meta.easy_correct / meta.easy_total) * 100)}%)
            </span>
          </p>
          <p className="text-[10px] text-amber-700/35 mt-0.5">avg {duration(meta.avg_easy_ms)}/task</p>
        </div>
        <div className="bg-amber-900/10 rounded-lg px-3 py-2.5">
          <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-1">Hard</p>
          <p className="text-sm font-semibold text-amber-200/80">
            {meta.hard_correct}/{meta.hard_total}
            <span className="text-xs font-normal text-amber-600/40 ml-1.5">
              ({Math.round((meta.hard_correct / meta.hard_total) * 100)}%)
            </span>
          </p>
          <p className="text-[10px] text-amber-700/35 mt-0.5">avg {duration(meta.avg_hard_ms)}/task</p>
        </div>
      </div>
      {meta.latency_ratio !== null && (
        <p className="text-xs text-amber-600/40">
          Latency ratio (hard/easy): <span className="font-mono text-amber-300/60">{meta.latency_ratio}×</span>
        </p>
      )}
      {meta.failure_examples.length > 0 && (
        <div>
          <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-1.5">Failures</p>
          <div className="space-y-1">
            {meta.failure_examples.map((f, i) => (
              <p key={i} className="text-[11px] font-mono text-red-400/50 bg-red-900/10 rounded px-2 py-1 leading-snug">
                {f}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SanityDetail({ meta }: { meta: SanityMeta }) {
  return (
    <p className="text-xs text-amber-500/50 font-mono bg-amber-900/10 rounded px-3 py-2">
      &ldquo;{meta.response}&rdquo;
    </p>
  );
}

function MetadataDetail({ benchmarkName, metadata }: { benchmarkName: string; metadata: string | null }) {
  if (!metadata) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(metadata); } catch { return null; }

  if (benchmarkName === "OODGeneralization") {
    return <OODDetail meta={parsed as OODMeta} />;
  }
  if (benchmarkName === "AdaptiveCompute") {
    return <AdaptiveDetail meta={parsed as AdaptiveMeta} />;
  }
  if (benchmarkName === "SanityCheck") {
    return <SanityDetail meta={parsed as SanityMeta} />;
  }
  return (
    <pre className="text-[10px] text-amber-700/40 font-mono whitespace-pre-wrap">
      {JSON.stringify(parsed, null, 2)}
    </pre>
  );
}

// ── Benchmark section (one per benchmark name) ────────────────────────────────

function BenchmarkSection({
  name,
  rows,
}: {
  name: string;
  rows: BenchmarkRunRow[];
}) {
  return (
    <div className="border border-amber-900/20 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 border-b border-amber-900/15 bg-amber-900/8">
        <h2 className="text-sm font-semibold text-amber-200/80">{name}</h2>
      </div>

      {/* Per-target rows */}
      <div className="divide-y divide-amber-900/10">
        {rows.map((row) => (
          <div key={row.id} className="px-4 py-4 space-y-3">
            {/* Target + score + cost + duration */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-medium text-amber-300/60">{row.target}</span>
                {row.target === "piro-student" && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-600/50 border border-amber-800/20">
                    stub
                  </span>
                )}
                {row.durationMs !== null && (
                  <span className="text-[10px] text-amber-700/35">{duration(row.durationMs)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {fmtCost(row.costUsd) && (
                  <span className="text-[10px] text-amber-700/40 font-mono">{fmtCost(row.costUsd)}</span>
                )}
                <ScorePill score={row.score} />
              </div>
            </div>
            {/* Benchmark-specific metadata */}
            <MetadataDetail benchmarkName={name} metadata={row.metadata} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SuiteRun["status"] }) {
  if (status === "queued") return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400/70">
      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      In progress…
    </span>
  );
  if (status === "complete") return (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-400/70">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      Complete
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-red-400/70">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Error
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RunDetail({ run: initial }: { run: SuiteRun }) {
  const router = useRouter();
  const [run, setRun] = useState(initial);

  // Poll while in-flight
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/benchmarks/suite-runs/${run.id}`);
      if (!res.ok) return;
      const data = await res.json() as { suite: SuiteRun };
      setRun(data.suite);
      if (data.suite.status !== "queued") router.refresh();
    } catch { /* silent */ }
  }, [run.id, router]);

  useEffect(() => {
    if (run.status !== "queued") return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [run.status, refresh]);

  // Group results by benchmark name
  const benchmarkNames = [...new Set(run.results.map((r) => r.benchmarkName))];
  const byBenchmark = Object.fromEntries(
    benchmarkNames.map((name) => [
      name,
      run.results.filter((r) => r.benchmarkName === name),
    ]),
  );

  const totalCost = run.results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <StatusBadge status={run.status} />
        <div className="flex items-center gap-4 text-[11px] text-amber-700/40">
          {run.completedAt ? (
            <span>{fmt(new Date(run.queuedAt))} → {fmt(new Date(run.completedAt))}</span>
          ) : (
            <span>Started {fmt(new Date(run.queuedAt))}</span>
          )}
          {run.status === "complete" && totalCost > 0 && (
            <span className="font-mono">${totalCost.toFixed(4)} total</span>
          )}
        </div>
      </div>

      {/* Error */}
      {run.status === "error" && run.error && (
        <div className="bg-red-900/15 border border-red-900/25 rounded-xl px-4 py-3 text-sm text-red-400/70">
          {run.error}
        </div>
      )}

      {/* In-progress placeholder */}
      {run.status === "queued" && (
        <div className="border border-amber-700/20 rounded-xl px-4 py-8 text-center">
          <p className="text-sm text-amber-400/40">Running benchmarks…</p>
          <p className="text-xs text-amber-700/30 mt-1">Results will appear here as they complete.</p>
        </div>
      )}

      {/* Benchmark sections */}
      {benchmarkNames.map((name) => (
        <BenchmarkSection key={name} name={name} rows={byBenchmark[name]} />
      ))}
    </div>
  );
}
