"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface BenchmarkRow {
  id: string;
  name: string;
  description: string | null;
  dataSourceId: string | null;
  dataSourceName: string | null;
  hasScript: boolean;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface RunRow {
  id: string;
  target: string;
  score: number;
  costUsd: number | null;
  durationMs: number | null;
  ranAt: string;
}

type Tab = "code" | "preview" | "runs";

// ── File viewer (fetches script.py from the benchmark file API) ──────────────

function ScriptViewer({ benchmarkId }: { benchmarkId: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/benchmarks/${benchmarkId}/file?path=script.py`)
      .then((r) => r.json())
      .then((d: { content?: string; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setContent(d.content ?? "");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [benchmarkId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <svg className="animate-spin w-4 h-4 text-amber-600/40" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-red-400/60">{error}</p>
        <p className="text-[11px] text-amber-700/30 mt-2">
          Push a script with <code className="font-mono text-amber-500/40">piro benchmarks push {benchmarkId}</code>
        </p>
      </div>
    );
  }

  return (
    <pre className="text-[11px] font-mono text-amber-300/60 p-4 overflow-x-auto overflow-y-auto max-h-[calc(100vh-220px)] whitespace-pre-wrap break-words leading-relaxed">
      {content}
    </pre>
  );
}

// ── Config value renderer ────────────────────────────────────────────────────

function ConfigValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-amber-700/30 italic">null</span>;
  }
  if (typeof value === "number") {
    return <span className="font-mono text-sky-400/70">{value.toLocaleString()}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="font-mono text-violet-400/70">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="font-mono text-amber-400/70">
        [{value.map((v, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <ConfigValue value={v} />
          </span>
        ))}]
      </span>
    );
  }
  if (typeof value === "object") {
    return <span className="font-mono text-amber-400/70">{JSON.stringify(value)}</span>;
  }
  return <span className="font-mono text-amber-300/70">{String(value)}</span>;
}

// ── Score pill ───────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "text-emerald-400/80 bg-emerald-900/20 border-emerald-700/20" :
    pct >= 50 ? "text-amber-400/80 bg-amber-900/20 border-amber-700/20" :
    "text-red-400/70 bg-red-900/20 border-red-700/20";
  return (
    <span className={`inline-flex items-center text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border ${color}`}>
      {pct}%
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BenchmarkDetail({
  benchmark,
  runs,
}: {
  benchmark: BenchmarkRow;
  runs: RunRow[];
}) {
  const [tab, setTab] = useState<Tab>("preview");

  const configEntries = benchmark.config
    ? Object.entries(benchmark.config)
    : [];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Meta row */}
      <div className="px-4 py-3 border-b border-amber-900/15 flex items-center gap-4 text-[11px] shrink-0 flex-wrap">
        {benchmark.dataSourceName && (
          <span className="text-amber-600/40">
            Data source:{" "}
            {benchmark.dataSourceId ? (
              <Link
                href={`/sources/${benchmark.dataSourceId}`}
                className="font-mono text-amber-500/60 hover:text-amber-400/80 transition-colors"
              >
                {benchmark.dataSourceName}
              </Link>
            ) : (
              <span className="font-mono text-amber-500/60">{benchmark.dataSourceName}</span>
            )}
          </span>
        )}
        {!benchmark.dataSourceName && (
          <span className="text-amber-700/30 italic">No data source linked</span>
        )}
        <span className="text-amber-700/30">
          Created {new Date(benchmark.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <span className="text-amber-700/30">
          Updated {new Date(benchmark.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-amber-900/15 shrink-0">
        {(["preview", "code", "runs"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              tab === t
                ? "bg-amber-900/20 text-amber-200/80"
                : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
            }`}
          >
            {t === "preview" ? "Preview" : t === "code" ? "Code" : `Runs${runs.length > 0 ? ` (${runs.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "preview" && (
          <div className="p-4 space-y-4 max-w-2xl">
            {/* What it tests */}
            <div>
              <h3 className="text-[11px] font-semibold text-amber-300/60 uppercase tracking-wider mb-2">What it tests</h3>
              <p className="text-xs text-amber-400/50 leading-relaxed">
                {benchmark.description ?? "No description provided."}
              </p>
            </div>

            {/* Data source */}
            <div>
              <h3 className="text-[11px] font-semibold text-amber-300/60 uppercase tracking-wider mb-2">Data source</h3>
              {benchmark.dataSourceName ? (
                <div className="flex items-center gap-2">
                  {benchmark.dataSourceId && (
                    <Link
                      href={`/sources/${benchmark.dataSourceId}`}
                      className="text-xs font-mono text-amber-500/60 hover:text-amber-400/80 transition-colors"
                    >
                      {benchmark.dataSourceName}
                    </Link>
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-700/30 italic">No data source linked</p>
              )}
            </div>

            {/* Eval config */}
            <div>
              <h3 className="text-[11px] font-semibold text-amber-300/60 uppercase tracking-wider mb-2">Eval config</h3>
              {configEntries.length > 0 ? (
                <div className="rounded-lg border border-amber-900/15 bg-amber-900/5 divide-y divide-amber-900/10">
                  {configEntries.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between px-3 py-2">
                      <span className="text-[11px] font-mono text-amber-400/50">{key}</span>
                      <span className="text-[11px]"><ConfigValue value={value} /></span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-700/30 italic">No eval config provided</p>
              )}
            </div>

            {/* How it runs */}
            <div>
              <h3 className="text-[11px] font-semibold text-amber-300/60 uppercase tracking-wider mb-2">How it runs</h3>
              <div className="text-xs text-amber-400/50 leading-relaxed space-y-1.5">
                <p>1. A model is trained on the linked data source&rsquo;s training split.</p>
                <p>2. The benchmark script generates held-out evaluation samples per the eval config.</p>
                <p>3. Each sample is scored — predictions are compared to ground-truth labels.</p>
                <p>4. Results are grouped by eval condition (e.g. sequence length) and reported as accuracy.</p>
              </div>
            </div>
          </div>
        )}

        {tab === "code" && (
          <ScriptViewer benchmarkId={benchmark.id} />
        )}

        {tab === "runs" && (
          <div className="p-4">
            {runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
                <p className="text-sm font-semibold text-amber-200/60">No runs yet</p>
                <p className="text-xs text-amber-600/40 mt-1 max-w-xs">
                  Results will appear here after a benchmark run completes.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-amber-900/15 bg-amber-900/5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-amber-300/70">{run.target}</span>
                        <ScorePill score={run.score} />
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-amber-700/30 mt-0.5">
                        <span>{new Date(run.ranAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        {run.durationMs && (
                          <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                        )}
                        {run.costUsd !== null && run.costUsd > 0 && (
                          <span>${run.costUsd.toFixed(4)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
