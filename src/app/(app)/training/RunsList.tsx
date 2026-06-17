"use client";

import { useEffect, useCallback, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrainingRunRow {
  id: string;
  modelTemplate: string;
  dataSource: string;
  status: "queued" | "running" | "complete" | "error";
  epochs: number;
  configJson: string | null;
  finalTrainLoss: number | null;
  finalValLoss: number | null;
  finalValAccuracy: number | null;
  epochHistoryJson: string | null;
  currentEpoch: number | null;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
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

function templateLabel(t: string): string {
  if (t === "ctm") return "CTM";
  if (t === "baseline-transformer") return "Baseline Transformer";
  return t;
}

function sourceLabel(s: string): string {
  if (s === "sorting-sequences") return "Sorting Sequences";
  return s;
}

// Modal CPU-only rate: $0.000027/s per vCPU (1 vCPU default)
const MODAL_CPU_RATE = 0.000027;

function formatRuntime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatCost(seconds: number): string {
  const cost = seconds * MODAL_CPU_RATE;
  if (cost < 0.0001) return "< $0.0001";
  return `$${cost.toFixed(4)}`;
}

function useElapsed(queuedAt: Date, active: boolean): number {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - queuedAt.getTime()) / 1000)
  );
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() =>
      setElapsed(Math.floor((Date.now() - queuedAt.getTime()) / 1000)), 1000
    );
    return () => clearInterval(id);
  }, [queuedAt, active]);
  return elapsed;
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TrainingRunRow["status"] }) {
  if (status === "queued" || status === "running") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400/70">
        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {status === "running" ? "Running" : "Queued"}
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

// ── Run card ──────────────────────────────────────────────────────────────────

function RunCard({ run }: { run: TrainingRunRow }) {
  const queuedAt = new Date(run.queuedAt);
  const isInFlight = run.status === "queued" || run.status === "running";
  const elapsed = useElapsed(queuedAt, isInFlight);

  const startedAt = run.startedAt ? new Date(run.startedAt) : null;
  const completedAt = run.completedAt ? new Date(run.completedAt) : null;

  // Cold start = queuedAt → startedAt (only meaningful if we have both)
  const coldStartSeconds = startedAt
    ? Math.floor((startedAt.getTime() - queuedAt.getTime()) / 1000)
    : null;

  // Training time = startedAt → completedAt (what Modal actually charges for)
  const trainingSeconds = startedAt && completedAt
    ? Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000)
    : completedAt
    ? Math.floor((completedAt.getTime() - queuedAt.getTime()) / 1000) // fallback: no startedAt
    : elapsed;

  const borderCls = isInFlight
    ? "border-amber-700/25 bg-amber-900/8"
    : run.status === "error"
    ? "border-red-900/20 bg-red-900/5"
    : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10";

  return (
    <Link
      href={`/training/${run.id}`}
      className={`block border rounded-xl overflow-hidden transition-colors ${borderCls}`}
    >
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* Left: status + time */}
        <div className="flex flex-col gap-1 shrink-0 w-24">
          <StatusBadge status={run.status} />
          <span className="text-[10px] text-amber-700/35">{timeAgo(queuedAt)}</span>
        </div>

        {/* Middle: config */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-xs text-amber-300/60">
            <span className="text-amber-600/40 mr-1">template:</span>
            {templateLabel(run.modelTemplate)}
          </p>
          <p className="text-xs text-amber-300/60">
            <span className="text-amber-600/40 mr-1">data:</span>
            {sourceLabel(run.dataSource)}
          </p>
          {(isInFlight || run.status === "complete") && (
            <p className="text-xs text-amber-300/60">
              <span className="text-amber-600/40 mr-1">train:</span>
              <span className="font-mono">{formatRuntime(trainingSeconds)}</span>
              {coldStartSeconds !== null && coldStartSeconds > 2 && (
                <>
                  <span className="text-amber-700/30 mx-1.5">·</span>
                  <span className="text-amber-600/40 mr-1">cold start:</span>
                  <span className="font-mono text-amber-500/40">{formatRuntime(coldStartSeconds)}</span>
                </>
              )}
              {run.status === "complete" && (
                <>
                  <span className="text-amber-700/30 mx-1.5">·</span>
                  <span className="text-amber-600/40 mr-1">cost:</span>
                  <span className="font-mono">{formatCost(trainingSeconds)}</span>
                </>
              )}
            </p>
          )}
          {run.status === "error" && run.error && (
            <p className="text-[10px] text-red-400/50 mt-1 truncate">{run.error}</p>
          )}
        </div>

        {/* Right: chevron */}
        <svg className="w-4 h-4 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RunsList({ initialRuns }: { initialRuns: TrainingRunRow[] }) {
  const [runs, setRuns] = useState<TrainingRunRow[]>(initialRuns);

  const hasInFlight = runs.some((r) => r.status === "queued" || r.status === "running");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/training-runs");
      if (!res.ok) return;
      const data = (await res.json()) as { runs: TrainingRunRow[] };
      setRuns(data.runs);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [hasInFlight, refresh]);

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center px-6">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-800/40 mb-4">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <p className="text-sm font-semibold text-amber-200/60">No training runs yet</p>
        <p className="text-xs text-amber-600/40 mt-1 mb-5 max-w-xs">
          Start a training run to see results here.
        </p>
        <Link
          href="/training/new"
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
      {runs.map((run) => (
        <RunCard key={run.id} run={run} />
      ))}
    </div>
  );
}
