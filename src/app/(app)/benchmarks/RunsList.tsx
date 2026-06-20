"use client";

import { useEffect, useCallback, useState } from "react";
import Link from "next/link";

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
  benchmarks: string | null; // JSON string[] | null
  targets: string[];          // resolved model names (server resolves UUIDs)
  stubs: string[];            // target names that are Piro-trained stubs
  queuedAt: string;
  completedAt: string | null;
  error: string | null;
  results: BenchmarkRunRow[];
}

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

function parseTags(json: string | null): string {
  if (!json) return "all";
  try {
    const arr = JSON.parse(json) as string[];
    return arr.length === 0 ? "all" : arr.join(", ");
  } catch {
    return "all";
  }
}

function formatTags(names: string[]): string {
  return names.length === 0 ? "all" : names.join(", ");
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SuiteRun["status"] }) {
  if (status === "queued") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400/70">
        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        In progress
      </span>
    );
  }
  if (status === "complete") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400/70">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Complete
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-red-400/70">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Error
    </span>
  );
}

// ── Suite run card ─────────────────────────────────────────────────────────────

function SuiteRunCard({ run }: { run: SuiteRun }) {
  const queuedAt = new Date(run.queuedAt);
  const benchmarkTags = parseTags(run.benchmarks);
  const targetTags = formatTags(run.targets);

  const inner = (
    <div className="px-4 py-3.5 flex items-center gap-3">
      {/* Left: status + time */}
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <StatusBadge status={run.status} />
        <span className="text-[10px] text-amber-700/35">{timeAgo(queuedAt)}</span>
      </div>

      {/* Middle: what was requested */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-xs text-amber-300/60">
          <span className="text-amber-600/40 mr-1">benchmarks:</span>{benchmarkTags}
        </p>
        <p className="text-xs text-amber-300/60">
          <span className="text-amber-600/40 mr-1">models:</span>{targetTags}
        </p>
        {run.status === "error" && run.error && (
          <p className="text-[10px] text-red-400/50 mt-1 truncate">{run.error}</p>
        )}
      </div>

      {/* Right: chevron */}
      <div className="flex items-center gap-2 shrink-0">
        <svg className="w-4 h-4 text-amber-800/30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </div>
  );

  const borderCls = run.status === "queued"
    ? "border-amber-700/25 bg-amber-900/8"
    : run.status === "error"
    ? "border-red-900/20 bg-red-900/5"
    : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10";

  return (
    <Link
      href={`/benchmarks/${run.id}`}
      className={`block border rounded-xl overflow-hidden transition-colors ${borderCls}`}
    >
      {inner}
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RunsList({ initialSuites }: { initialSuites: SuiteRun[] }) {
  const [suites, setSuites] = useState<SuiteRun[]>(initialSuites);

  const hasInFlight = suites.some((s) => s.status === "queued");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/benchmarks/suite-runs");
      if (!res.ok) return;
      const data = (await res.json()) as { suites: SuiteRun[] };
      setSuites(data.suites);
    } catch {
      // silent — polling failure shouldn't surface an error
    }
  }, []);

  // Poll every 5s while any run is in-flight
  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [hasInFlight, refresh]);

  if (suites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center px-6">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-800/40 mb-4">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <p className="text-sm font-semibold text-amber-200/60">No runs yet</p>
        <p className="text-xs text-amber-600/40 mt-1 mb-5 max-w-xs">
          Start a benchmark run to see results here.
        </p>
        <Link
          href="/benchmarks/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-500/30 bg-orange-500/10 text-sm font-semibold text-amber-100 hover:bg-orange-500/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New run
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {suites.map((run) => (
        <SuiteRunCard key={run.id} run={run} />
      ))}
    </div>
  );
}
