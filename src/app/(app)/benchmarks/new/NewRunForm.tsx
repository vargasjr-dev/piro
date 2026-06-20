"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Dynamic benchmark catalog (fetched from DB) ───────────────────────────────

interface BenchmarkOption {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

// ── Dynamic model targets (fetched from DB) ───────────────────────────────────

interface ModelTarget {
  id: string;     // model.id — sent to trigger as the target key
  name: string;   // display name
  tag: "trained" | "hosted";
  sublabel?: string;
}

// ── Checkbox component ────────────────────────────────────────────────────────

function Checkbox({
  checked,
  onChange,
  label,
  description,
  sublabel,
  tag,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  sublabel?: string;
  tag?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        w-full text-left px-4 py-3 rounded-xl border transition-colors
        ${checked
          ? "border-orange-500/40 bg-orange-500/8 text-amber-100"
          : "border-amber-900/20 bg-amber-900/5 text-amber-400/60 hover:bg-amber-900/10"
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`
          mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
          ${checked ? "bg-orange-500/70 border-orange-500/50" : "border-amber-700/40"}
        `}>
          {checked && (
            <svg className="w-2.5 h-2.5 text-amber-50" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{label}</span>
            {tag && (
              <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                tag === "trained"
                  ? "text-orange-400/70 border-orange-800/30 bg-orange-900/20"
                  : "text-amber-600/50 border-amber-800/25 bg-amber-900/15"
              }`}>
                {tag}
              </span>
            )}
          </div>
          {sublabel && <p className="text-[10px] text-amber-600/40 mt-0.5">{sublabel}</p>}
          {description && (
            <p className="text-[11px] text-amber-600/40 mt-0.5 leading-snug">{description}</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  allSelected,
  onToggleAll,
}: {
  title: string;
  allSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
        {title}
      </h2>
      <button
        type="button"
        onClick={onToggleAll}
        className="text-[10px] text-amber-500/50 hover:text-amber-300/80 transition-colors"
      >
        {allSelected ? "Deselect all" : "Select all"}
      </button>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function NewRunForm() {
  const router = useRouter();

  const [benchmarkOptions, setBenchmarkOptions] = useState<BenchmarkOption[]>([]);
  const [benchmarksLoading, setBenchmarksLoading] = useState(true);
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<Set<string>>(new Set());
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<ModelTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);

  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch benchmark catalog from DB (lazy-seeds defaults on first call)
  useEffect(() => {
    fetch("/api/benchmark-catalog")
      .then((r) => r.json())
      .then((d: { benchmarks: BenchmarkOption[] }) => {
        setBenchmarkOptions(d.benchmarks);
        setSelectedBenchmarks(new Set(d.benchmarks.map((b) => b.slug)));
      })
      .catch(() => {})
      .finally(() => setBenchmarksLoading(false));
  }, []);

  // Fetch models from DB
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: { models: Array<{
        id: string;
        name: string;
        hostedApi: { provider: string; apiModelName: string } | null;
        trainingRunId: string | null;
        parameterCount: number | null;
      }> }) => {
        const built: ModelTarget[] = data.models.map((m) => ({
          id: m.id,
          name: m.name,
          tag: m.trainingRunId ? "trained" : "hosted",
          sublabel: m.hostedApi
            ? `${m.hostedApi.provider} / ${m.hostedApi.apiModelName}`
            : m.parameterCount != null
            ? `${m.parameterCount.toLocaleString()} params`
            : undefined,
        }));
        setTargets(built);
        // Default: select all
        setSelectedTargetIds(new Set(built.map((t) => t.id)));
      })
      .catch(() => {})
      .finally(() => setTargetsLoading(false));
  }, []);

  const toggleBenchmark = (slug: string, checked: boolean) => {
    setSelectedBenchmarks((prev) => {
      const next = new Set(prev);
      checked ? next.add(slug) : next.delete(slug);
      return next;
    });
  };

  const toggleTarget = (id: string, checked: boolean) => {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const allBenchmarksSelected = benchmarkOptions.length > 0 && selectedBenchmarks.size === benchmarkOptions.length;
  const allTargetsSelected = targets.length > 0 && selectedTargetIds.size === targets.length;
  const canSubmit =
    status !== "loading" &&
    selectedBenchmarks.size > 0 &&
    selectedTargetIds.size > 0;

  const handleSubmit = async () => {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/benchmarks/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          benchmarks: allBenchmarksSelected ? [] : [...selectedBenchmarks],
          targets: allTargetsSelected ? [] : [...selectedTargetIds],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      router.push("/benchmarks");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  };

  return (
    <div className="max-w-lg mx-auto px-6 py-8 space-y-8">
      {/* Benchmarks section */}
      <div>
        <SectionHeader
          title="Benchmarks"
          allSelected={allBenchmarksSelected}
          onToggleAll={() =>
            setSelectedBenchmarks(
              allBenchmarksSelected
                ? new Set()
                : new Set(benchmarkOptions.map((b) => b.slug)),
            )
          }
        />
        <div className="space-y-2">
          {benchmarksLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl border border-amber-900/20 bg-amber-900/5 animate-pulse" />
            ))
          ) : benchmarkOptions.length === 0 ? (
            <p className="text-xs text-amber-700/30 px-1">No benchmarks found</p>
          ) : (
            benchmarkOptions.map((b) => (
              <Checkbox
                key={b.slug}
                checked={selectedBenchmarks.has(b.slug)}
                onChange={(v) => toggleBenchmark(b.slug, v)}
                label={b.name}
                description={b.description ?? undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Targets section */}
      <div>
        <SectionHeader
          title="Models"
          allSelected={allTargetsSelected}
          onToggleAll={() =>
            setSelectedTargetIds(
              allTargetsSelected ? new Set() : new Set(targets.map((t) => t.id)),
            )
          }
        />
        {targetsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl border border-amber-900/20 bg-amber-900/5 animate-pulse" />
            ))}
          </div>
        ) : targets.length === 0 ? (
          <div className="px-4 py-6 rounded-xl border border-amber-900/20 bg-amber-900/5 text-center">
            <p className="text-xs text-amber-600/40">No models found</p>
            <Link href="/training/new" className="text-[11px] text-orange-400/60 hover:text-orange-300/70 mt-1 block transition-colors">
              Start a training run →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {targets.map((t) => (
              <Checkbox
                key={t.id}
                checked={selectedTargetIds.has(t.id)}
                onChange={(v) => toggleTarget(t.id, v)}
                label={t.name}
                tag={t.tag}
                sublabel={t.sublabel}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <p className="text-xs text-red-400/70 bg-red-900/10 border border-red-900/20 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-500/40 text-sm font-semibold text-amber-100 hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Queuing run…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
              </svg>
              Start run
            </>
          )}
        </button>
        <Link href="/benchmarks" className="text-sm text-amber-500/50 hover:text-amber-300/80 transition-colors">
          Cancel
        </Link>
      </div>

      <p className="text-[11px] text-amber-700/30 leading-relaxed">
        Results appear in the benchmarks list automatically once the run completes.
      </p>
    </div>
  );
}
