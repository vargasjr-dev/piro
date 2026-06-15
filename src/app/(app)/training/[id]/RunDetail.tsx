"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TrainingRunRow } from "../RunsList";

interface EpochRecord {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  valAccuracy: number;
}

function fmt(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function templateLabel(t: string): string {
  if (t === "ctm") return "Continuous Thought Model";
  if (t === "baseline-transformer") return "Baseline Transformer";
  return t;
}

function sourceLabel(s: string): string {
  if (s === "sorting-sequences") return "Sorting Sequences";
  return s;
}

function StatusBadge({ status }: { status: TrainingRunRow["status"] }) {
  if (status === "queued" || status === "running") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400/70">
        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {status === "running" ? "Running…" : "Queued"}
      </span>
    );
  }
  if (status === "complete") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400/70">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Complete
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-red-400/70">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Error
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 rounded-xl border border-amber-900/20 bg-amber-900/5">
      <p className="text-[10px] text-amber-600/40 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-mono font-semibold text-amber-200/80 mt-1">{value}</p>
    </div>
  );
}

function EpochTable({ history }: { history: EpochRecord[] }) {
  // Show every Nth row when there are many epochs
  const stride = history.length > 20 ? Math.ceil(history.length / 20) : 1;
  const rows = history.filter((r) => r.epoch % stride === 0 || r.epoch === history[history.length - 1].epoch);

  return (
    <div className="overflow-x-auto rounded-xl border border-amber-900/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-amber-900/20 bg-amber-900/10">
            <th className="px-3 py-2 text-left text-amber-600/40 font-medium">Epoch</th>
            <th className="px-3 py-2 text-right text-amber-600/40 font-medium">Train Loss</th>
            <th className="px-3 py-2 text-right text-amber-600/40 font-medium">Val Loss</th>
            <th className="px-3 py-2 text-right text-amber-600/40 font-medium">Val Acc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.epoch} className="border-b border-amber-900/10 last:border-0">
              <td className="px-3 py-1.5 font-mono text-amber-700/50">{r.epoch}</td>
              <td className="px-3 py-1.5 text-right font-mono text-amber-300/60">{r.trainLoss.toFixed(4)}</td>
              <td className="px-3 py-1.5 text-right font-mono text-amber-300/60">{r.valLoss.toFixed(4)}</td>
              <td className="px-3 py-1.5 text-right font-mono text-amber-300/60">{(r.valAccuracy * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RunDetail({ initialRun }: { initialRun: TrainingRunRow }) {
  const [run, setRun] = useState<TrainingRunRow>(initialRun);
  const router = useRouter();

  const isInFlight = run.status === "queued" || run.status === "running";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/training-runs/${run.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { run: TrainingRunRow };
      setRun(data.run);
      if (data.run.status === "complete" || data.run.status === "error") {
        router.refresh();
      }
    } catch {
      // silent
    }
  }, [run.id, router]);

  useEffect(() => {
    if (!isInFlight) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [isInFlight, refresh]);

  const queuedAt = new Date(run.queuedAt);

  // Parse epoch history if present
  let epochHistory: EpochRecord[] | null = null;
  if (run.epochHistoryJson) {
    try {
      epochHistory = JSON.parse(run.epochHistoryJson) as EpochRecord[];
    } catch {
      // ignore malformed JSON
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-lg">
      {/* Status */}
      <div className="space-y-1">
        <StatusBadge status={run.status} />
        <p className="text-[11px] text-amber-700/30">Queued {fmt(queuedAt)}</p>
        {run.completedAt && (
          <p className="text-[11px] text-amber-700/30">
            Completed {fmt(new Date(run.completedAt))}
          </p>
        )}
      </div>

      {/* Config */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">Config</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-amber-600/40">Model</span>
            <span className="text-amber-200/70 font-medium">{templateLabel(run.modelTemplate)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-amber-600/40">Data source</span>
            <span className="text-amber-200/70 font-medium">{sourceLabel(run.dataSource)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-amber-600/40">Epochs</span>
            <span className="text-amber-200/70 font-mono">{run.epochs}</span>
          </div>
        </div>
      </div>

      {/* Metrics — only shown when complete */}
      {run.status === "complete" && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">Results</h2>
          <div className="grid grid-cols-3 gap-3">
            {run.finalValAccuracy !== null && (
              <MetricCard
                label="Val Acc"
                value={`${(run.finalValAccuracy * 100).toFixed(1)}%`}
              />
            )}
            {run.finalValLoss !== null && (
              <MetricCard label="Val Loss" value={run.finalValLoss.toFixed(4)} />
            )}
            {run.finalTrainLoss !== null && (
              <MetricCard label="Train Loss" value={run.finalTrainLoss.toFixed(4)} />
            )}
          </div>
        </div>
      )}

      {/* Epoch history table */}
      {epochHistory && epochHistory.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
            Epoch History
          </h2>
          <EpochTable history={epochHistory} />
        </div>
      )}

      {/* Error */}
      {run.status === "error" && run.error && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-red-400/50 uppercase tracking-widest">Error</h2>
          <pre className="text-[11px] text-red-400/60 bg-red-900/10 border border-red-900/20 rounded-xl px-4 py-3 whitespace-pre-wrap break-words font-mono">
            {run.error}
          </pre>
        </div>
      )}
    </div>
  );
}
