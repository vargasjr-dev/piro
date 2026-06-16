"use client";

import { useState, useEffect, useRef } from "react";
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
  if (status === "running") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400/70">
        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Running…
      </span>
    );
  }
  if (status === "queued") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400/50">
        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Queued — waiting for worker
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

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-amber-600/40">Epoch {current} / {total}</span>
        <span className="text-amber-500/50 font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-amber-900/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-orange-500/60 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EpochTable({ history }: { history: EpochRecord[] }) {
  const stride = history.length > 20 ? Math.ceil(history.length / 20) : 1;
  const rows = history.filter(
    (r) => r.epoch % stride === 0 || r.epoch === history[history.length - 1].epoch,
  );
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
  const [liveHistory, setLiveHistory] = useState<EpochRecord[]>(() => {
    if (initialRun.epochHistoryJson) {
      try { return JSON.parse(initialRun.epochHistoryJson) as EpochRecord[]; } catch { /* ignore */ }
    }
    return [];
  });
  const esRef = useRef<EventSource | null>(null);

  const isInFlight = run.status === "queued" || run.status === "running";

  useEffect(() => {
    if (!isInFlight) return;

    const es = new EventSource(`/api/training-runs/${run.id}/stream`);
    esRef.current = es;

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data) as {
        currentEpoch: number;
        epochs: number;
        history: EpochRecord[];
        status: string;
      };
      setLiveHistory(data.history);
      setRun((r) => ({
        ...r,
        currentEpoch: data.currentEpoch,
        status: data.status as TrainingRunRow["status"],
      }));
    });

    es.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data) as {
        finalTrainLoss: number;
        finalValLoss: number;
        finalValAccuracy: number;
        epochHistoryJson: string;
        completedAt: string;
      };
      setRun((r) => ({
        ...r,
        status: "complete",
        finalTrainLoss: data.finalTrainLoss,
        finalValLoss: data.finalValLoss,
        finalValAccuracy: data.finalValAccuracy,
        epochHistoryJson: data.epochHistoryJson,
        completedAt: data.completedAt,
      }));
      if (data.epochHistoryJson) {
        try { setLiveHistory(JSON.parse(data.epochHistoryJson) as EpochRecord[]); } catch { /* ignore */ }
      }
      es.close();
    });

    es.addEventListener("error", (e) => {
      // EventSource fires this both for stream errors AND SSE error events —
      // only parse data if it looks like our error event
      if ("data" in e && typeof (e as MessageEvent).data === "string") {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { message: string };
          setRun((r) => ({ ...r, status: "error", error: data.message }));
        } catch { /* ignore */ }
      }
      es.close();
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [run.id, isInFlight]);

  const queuedAt = new Date(run.queuedAt);

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

      {/* Live progress bar — shown while running */}
      {run.status === "running" && run.currentEpoch !== null && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">Progress</h2>
          <ProgressBar current={run.currentEpoch} total={run.epochs} />
          {liveHistory.length > 0 && (
            <div className="flex gap-4 text-[11px]">
              <span className="text-amber-600/40">
                loss <span className="font-mono text-amber-300/60">
                  {liveHistory[liveHistory.length - 1].valLoss.toFixed(4)}
                </span>
              </span>
              <span className="text-amber-600/40">
                acc <span className="font-mono text-amber-300/60">
                  {(liveHistory[liveHistory.length - 1].valAccuracy * 100).toFixed(1)}%
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Final metrics — only shown when complete */}
      {run.status === "complete" && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">Results</h2>
          <div className="grid grid-cols-3 gap-3">
            {run.finalValAccuracy !== null && (
              <MetricCard label="Val Acc" value={`${(run.finalValAccuracy * 100).toFixed(1)}%`} />
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

      {/* Epoch history table — fills in live while running, full when complete */}
      {liveHistory.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
            Epoch History
            {run.status === "running" && (
              <span className="ml-2 normal-case font-normal text-amber-700/40">live</span>
            )}
          </h2>
          <EpochTable history={liveHistory} />
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
