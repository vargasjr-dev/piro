"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { OODFailure } from "~/lib/benchmarks/ood-generalization";
import type { AdaptiveFailure } from "~/lib/benchmarks/adaptive-compute";

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
  targets: string[];
  stubs: string[];
  queuedAt: string;
  completedAt: string | null;
  error: string | null;
  results: BenchmarkRunRow[];
}

// ── Metadata shapes (new + legacy) ────────────────────────────────────────────

interface OODMeta {
  n_tests: number;
  n_correct: number;
  failures?: OODFailure[];
  failure_examples?: string[]; // legacy: capped at 3
}

interface AdaptiveMeta {
  easy_correct: number;
  easy_total: number;
  hard_correct: number;
  hard_total: number;
  avg_easy_ms: number;
  avg_hard_ms: number;
  latency_ratio: number | null;
  failures?: AdaptiveFailure[];
  failure_examples?: string[]; // legacy: capped at 3
}

interface SanityMeta {
  response: string;
}

// ── Flyout payload ────────────────────────────────────────────────────────────

type TestDetail =
  | { kind: "ood"; prompt: string; expected: string; got: string }
  | { kind: "adaptive"; prompt: string; expected: string; got: string; difficulty: "easy" | "hard" }
  | { kind: "legacy"; text: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

// ── Extract failures from a row's metadata ────────────────────────────────────

function getRowFailures(row: BenchmarkRunRow): {
  failures: TestDetail[];
  total: number;
  correct: number;
  storedCount: number;
} {
  if (!row.metadata) return { failures: [], total: 0, correct: 0, storedCount: 0 };
  let meta: unknown;
  try { meta = JSON.parse(row.metadata); } catch {
    return { failures: [], total: 0, correct: 0, storedCount: 0 };
  }

  if (row.benchmarkName === "OODGeneralization") {
    const m = meta as OODMeta;
    let failures: TestDetail[] = [];
    if (m.failures?.length) {
      failures = m.failures.map((f) => ({
        kind: "ood" as const,
        prompt: f.prompt,
        expected: `[${f.expected.join(" ")}]`,
        got: f.got,
      }));
    } else if (m.failure_examples?.length) {
      // Legacy: only up to 3 stored
      failures = m.failure_examples.map((s) => ({ kind: "legacy" as const, text: s }));
    }
    return { failures, total: m.n_tests, correct: m.n_correct, storedCount: failures.length };
  }

  if (row.benchmarkName === "AdaptiveCompute") {
    const m = meta as AdaptiveMeta;
    const total = m.easy_total + m.hard_total;
    const correct = m.easy_correct + m.hard_correct;
    let failures: TestDetail[] = [];
    if (m.failures?.length) {
      failures = m.failures.map((f) => ({
        kind: "adaptive" as const,
        prompt: f.prompt,
        expected: String(f.expected),
        got: f.got,
        difficulty: f.difficulty,
      }));
    } else if (m.failure_examples?.length) {
      failures = m.failure_examples.map((s) => ({ kind: "legacy" as const, text: s }));
    }
    return { failures, total, correct, storedCount: failures.length };
  }

  return { failures: [], total: 0, correct: 0, storedCount: 0 };
}

// ── ScorePill ─────────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number }) {
  const cls =
    score >= 0.8
      ? "text-emerald-300/80 border-emerald-800/30 bg-emerald-900/20"
      : score >= 0.4
        ? "text-amber-300/80 border-amber-800/25 bg-amber-900/20"
        : "text-red-400/70 border-red-800/25 bg-red-900/15";
  return (
    <span
      className={`inline-flex items-center text-xs font-mono font-semibold px-2 py-0.5 rounded-lg border ${cls}`}
    >
      {score.toFixed(3)}
    </span>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SuiteRun["status"] }) {
  if (status === "queued")
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400/70">
        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        In progress…
      </span>
    );
  if (status === "complete")
    return (
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

// ── FlyoutPanel ───────────────────────────────────────────────────────────────

function FlyoutPanel({
  detail,
  target,
  benchmarkName,
  onClose,
}: {
  detail: TestDetail;
  target: string;
  benchmarkName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-[#0e0b07] border-l border-amber-900/25 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-amber-900/20 shrink-0">
          <div>
            <p className="text-xs font-semibold text-amber-200/80">{benchmarkName}</p>
            <p className="text-[11px] text-amber-600/40 mt-0.5">{target}</p>
          </div>
          <button
            onClick={onClose}
            className="text-amber-700/40 hover:text-amber-400/70 transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {detail.kind === "legacy" ? (
            <div>
              <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-2">Test Result</p>
              <p className="text-xs font-mono text-red-400/60 bg-red-900/10 rounded-lg px-3 py-2.5 leading-relaxed">
                {detail.text}
              </p>
              <p className="text-[10px] text-amber-700/30 mt-3 italic">
                Re-run this benchmark to see full prompt and expected output.
              </p>
            </div>
          ) : (
            <>
              {detail.kind === "adaptive" && (
                <span
                  className={`inline-block text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    detail.difficulty === "hard"
                      ? "bg-red-900/20 text-red-400/60 border-red-800/20"
                      : "bg-emerald-900/20 text-emerald-400/60 border-emerald-800/20"
                  }`}
                >
                  {detail.difficulty}
                </span>
              )}

              <div>
                <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-2">Prompt</p>
                <pre className="text-[11px] font-mono text-amber-400/70 bg-amber-900/10 rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-wrap break-words">
                  {detail.prompt}
                </pre>
              </div>

              <div>
                <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-2">Expected</p>
                <p className="text-xs font-mono text-emerald-400/70 bg-emerald-900/10 rounded-lg px-3 py-2.5 leading-relaxed break-all">
                  {detail.expected}
                </p>
              </div>

              <div>
                <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-2">Got</p>
                <p className="text-xs font-mono text-red-400/60 bg-red-900/10 rounded-lg px-3 py-2.5 leading-relaxed break-all">
                  {detail.got || <span className="italic text-amber-700/30">empty</span>}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── TargetRow (collapsible) ───────────────────────────────────────────────────

const PAGE_SIZE = 10;

function TargetRow({
  row,
  isStub,
  onSelectTest,
}: {
  row: BenchmarkRunRow;
  isStub: boolean;
  onSelectTest: (d: TestDetail) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);

  const { failures, total, correct, storedCount } = getRowFailures(row);
  const nFailed = total - correct;
  const pageItems = failures.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasMore = (page + 1) * PAGE_SIZE < failures.length;
  const hasPrev = page > 0;
  const hasStats = total > 0;

  // AdaptiveCompute breakdown (always parsed for header)
  let adaptiveMeta: AdaptiveMeta | null = null;
  if (row.benchmarkName === "AdaptiveCompute" && row.metadata) {
    try { adaptiveMeta = JSON.parse(row.metadata) as AdaptiveMeta; } catch { /* skip */ }
  }

  // SanityCheck response
  let sanityResponse: string | null = null;
  if (row.benchmarkName === "SanityCheck" && row.metadata) {
    try { sanityResponse = (JSON.parse(row.metadata) as SanityMeta).response; } catch { /* skip */ }
  }

  return (
    <div>
      {/* Collapsed header — click to expand */}
      <button
        className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-amber-900/5 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-amber-300/70 truncate">{row.target}</span>
          {isStub && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-600/50 border border-amber-800/20">
              stub
            </span>
          )}
          {hasStats && (
            <span className="shrink-0 text-[10px] font-mono text-amber-600/40">
              {correct}/{total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.durationMs !== null && (
            <span className="text-[10px] text-amber-700/35">{duration(row.durationMs)}</span>
          )}
          {fmtCost(row.costUsd) !== null && (
            <span className="text-[10px] text-amber-700/40 font-mono">{fmtCost(row.costUsd)}</span>
          )}
          <ScorePill score={row.score} />
          <svg
            className={`w-3.5 h-3.5 text-amber-700/35 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-amber-900/10 px-4 py-3 space-y-3 bg-amber-950/20">
          {/* SanityCheck: just the response */}
          {sanityResponse !== null && (
            <div>
              <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-1.5">Response</p>
              <p className="text-xs font-mono text-amber-500/50 bg-amber-900/10 rounded px-3 py-2">
                &ldquo;{sanityResponse}&rdquo;
              </p>
            </div>
          )}

          {/* AdaptiveCompute easy/hard breakdown */}
          {adaptiveMeta && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-900/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-0.5">Easy</p>
                <p className="text-xs font-semibold text-amber-200/70">
                  {adaptiveMeta.easy_correct}/{adaptiveMeta.easy_total}
                </p>
                <p className="text-[10px] text-amber-700/35">avg {duration(adaptiveMeta.avg_easy_ms)}</p>
              </div>
              <div className="bg-amber-900/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-0.5">Hard</p>
                <p className="text-xs font-semibold text-amber-200/70">
                  {adaptiveMeta.hard_correct}/{adaptiveMeta.hard_total}
                </p>
                <p className="text-[10px] text-amber-700/35">avg {duration(adaptiveMeta.avg_hard_ms)}</p>
              </div>
            </div>
          )}

          {/* Failure list */}
          {nFailed > 0 && failures.length > 0 ? (
            <div>
              <p className="text-[10px] text-amber-700/40 uppercase tracking-wider mb-1.5">
                Failures
                <span className="ml-1 font-mono normal-case">
                  ({storedCount < nFailed ? `${storedCount} stored of ${nFailed} — re-run for all` : nFailed})
                </span>
              </p>
              <div className="space-y-1">
                {pageItems.map((f, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2 rounded-lg bg-red-900/10 hover:bg-red-900/20 transition-colors group"
                    onClick={() => onSelectTest(f)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-mono text-red-400/50 truncate flex-1">
                        {f.kind === "legacy"
                          ? f.text
                          : `expected ${f.expected} · got "${f.got.slice(0, 50)}"`}
                      </p>
                      <span className="shrink-0 text-[10px] text-amber-700/30 group-hover:text-amber-400/50 transition-colors">
                        view →
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Prev / next */}
              {(hasPrev || hasMore) && (
                <div className="flex items-center gap-3 mt-2 pt-1">
                  {hasPrev && (
                    <button
                      className="text-[10px] text-amber-600/40 hover:text-amber-400/70 transition-colors"
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ← prev
                    </button>
                  )}
                  {hasMore && (
                    <button
                      className="text-[10px] text-amber-600/40 hover:text-amber-400/70 transition-colors"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      next {Math.min(PAGE_SIZE, failures.length - (page + 1) * PAGE_SIZE)} →
                    </button>
                  )}
                  <span className="text-[10px] text-amber-800/30 font-mono ml-auto">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, failures.length)} / {failures.length}
                  </span>
                </div>
              )}
            </div>
          ) : nFailed === 0 && total > 0 ? (
            <p className="text-[11px] text-emerald-400/50 flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              All {total} tests passed
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── BenchmarkSection ──────────────────────────────────────────────────────────

function BenchmarkSection({
  name,
  rows,
  stubs,
  onSelectTest,
}: {
  name: string;
  rows: BenchmarkRunRow[];
  stubs: Set<string>;
  onSelectTest: (d: TestDetail, target: string) => void;
}) {
  return (
    <div className="border border-amber-900/20 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-900/15 bg-amber-900/8">
        <h2 className="text-sm font-semibold text-amber-200/80">{name}</h2>
      </div>
      <div className="divide-y divide-amber-900/10">
        {rows.map((row) => (
          <TargetRow
            key={row.id}
            row={row}
            isStub={stubs.has(row.target)}
            onSelectTest={(d) => onSelectTest(d, row.target)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RunDetail({ run: initial }: { run: SuiteRun }) {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  const [flyout, setFlyout] = useState<{
    detail: TestDetail;
    target: string;
    benchmarkName: string;
  } | null>(null);

  // Poll while in-flight
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/benchmarks/suite-runs/${run.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { suite: SuiteRun };
      setRun(data.suite);
      if (data.suite.status !== "queued") router.refresh();
    } catch {
      /* silent */
    }
  }, [run.id, router]);

  useEffect(() => {
    if (run.status !== "queued") return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [run.status, refresh]);

  const benchmarkNames = [...new Set(run.results.map((r) => r.benchmarkName))];
  const byBenchmark = Object.fromEntries(
    benchmarkNames.map((name) => [
      name,
      run.results.filter((r) => r.benchmarkName === name),
    ]),
  );
  const stubSet = new Set(run.stubs);
  const totalCost = run.results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  return (
    <>
      {/* Flyout */}
      {flyout && (
        <FlyoutPanel
          detail={flyout.detail}
          target={flyout.target}
          benchmarkName={flyout.benchmarkName}
          onClose={() => setFlyout(null)}
        />
      )}

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Summary row */}
        <div className="flex items-center justify-between">
          <StatusBadge status={run.status} />
          <div className="flex items-center gap-4 text-[11px] text-amber-700/40">
            {run.completedAt ? (
              <span>
                {fmt(new Date(run.queuedAt))} → {fmt(new Date(run.completedAt))}
              </span>
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
            <p className="text-xs text-amber-700/30 mt-1">
              Results will appear here as they complete.
            </p>
          </div>
        )}

        {/* Benchmark sections */}
        {benchmarkNames.map((name) => (
          <BenchmarkSection
            key={name}
            name={name}
            rows={byBenchmark[name]}
            stubs={stubSet}
            onSelectTest={(d, target) =>
              setFlyout({ detail: d, target, benchmarkName: name })
            }
          />
        ))}
      </div>
    </>
  );
}
