"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Static catalog — mirrors model/run_benchmarks.py registry ────────────────

const BENCHMARKS = [
  {
    name: "SanityCheck",
    label: "Sanity Check",
    description: "Does the model return a non-empty string? Trivially easy — validates the pipeline.",
  },
  {
    name: "OODGeneralization",
    label: "OOD Generalization",
    description: "Sort sequences at 4× training length. Tests out-of-distribution generalization.",
  },
  {
    name: "AdaptiveCompute",
    label: "Adaptive Compute",
    description: "Easy (single-step arithmetic) vs. hard (chained operations). Measures latency ratio as a compute proxy.",
  },
] as const;

const TARGETS = [
  { name: "gpt-4o-mini", label: "GPT-4o mini", tag: "baseline" },
  { name: "gpt-4o", label: "GPT-4o", tag: "baseline" },
  { name: "piro-student", label: "Piro Student", tag: "student" },
] as const;

type BenchmarkName = (typeof BENCHMARKS)[number]["name"];
type TargetName = (typeof TARGETS)[number]["name"];

// ── Checkbox component ────────────────────────────────────────────────────────

function Checkbox({
  checked,
  onChange,
  label,
  description,
  tag,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  tag?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        w-full text-left px-4 py-3 rounded-xl border transition-colors
        ${checked
          ? "bg-orange-500/10 border-orange-500/30 text-amber-100"
          : "bg-amber-900/10 border-amber-900/20 text-amber-400/60 hover:border-amber-800/40 hover:text-amber-300/80"
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox box */}
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            {tag && (
              <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                tag === "student"
                  ? "text-orange-400/70 border-orange-800/30 bg-orange-900/20"
                  : "text-amber-600/50 border-amber-800/25 bg-amber-900/15"
              }`}>
                {tag}
              </span>
            )}
          </div>
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

  const [selectedBenchmarks, setSelectedBenchmarks] = useState<Set<BenchmarkName>>(
    new Set(BENCHMARKS.map((b) => b.name)),
  );
  const [selectedTargets, setSelectedTargets] = useState<Set<TargetName>>(
    new Set(TARGETS.map((t) => t.name)),
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleBenchmark = (name: BenchmarkName, checked: boolean) => {
    setSelectedBenchmarks((prev) => {
      const next = new Set(prev);
      checked ? next.add(name) : next.delete(name);
      return next;
    });
  };

  const toggleTarget = (name: TargetName, checked: boolean) => {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      checked ? next.add(name) : next.delete(name);
      return next;
    });
  };

  const allBenchmarksSelected = selectedBenchmarks.size === BENCHMARKS.length;
  const allTargetsSelected = selectedTargets.size === TARGETS.length;
  const canSubmit =
    status !== "loading" &&
    selectedBenchmarks.size > 0 &&
    selectedTargets.size > 0;

  const handleSubmit = async () => {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/benchmarks/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          benchmarks: allBenchmarksSelected ? [] : [...selectedBenchmarks],
          targets: allTargetsSelected ? [] : [...selectedTargets],
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
                : new Set(BENCHMARKS.map((b) => b.name)),
            )
          }
        />
        <div className="space-y-2">
          {BENCHMARKS.map((b) => (
            <Checkbox
              key={b.name}
              checked={selectedBenchmarks.has(b.name)}
              onChange={(v) => toggleBenchmark(b.name, v)}
              label={b.label}
              description={b.description}
            />
          ))}
        </div>
      </div>

      {/* Models section */}
      <div>
        <SectionHeader
          title="Models under test"
          allSelected={allTargetsSelected}
          onToggleAll={() =>
            setSelectedTargets(
              allTargetsSelected
                ? new Set()
                : new Set(TARGETS.map((t) => t.name)),
            )
          }
        />
        <div className="space-y-2">
          {TARGETS.map((t) => (
            <Checkbox
              key={t.name}
              checked={selectedTargets.has(t.name)}
              onChange={(v) => toggleTarget(t.name, v)}
              label={t.label}
              tag={t.tag}
            />
          ))}
        </div>
      </div>

      {/* Error message */}
      {status === "error" && errorMsg && (
        <p className="text-xs text-red-400/70 bg-red-900/15 border border-red-900/25 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`
            flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors
            ${canSubmit
              ? "bg-orange-500/20 border border-orange-500/30 text-amber-100 hover:bg-orange-500/30"
              : "bg-amber-900/15 border border-amber-900/20 text-amber-600/30 cursor-not-allowed"
            }
          `}
        >
          {status === "loading" ? (
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
            </svg>
          )}
          {status === "loading" ? "Queuing run…" : "Start run"}
        </button>
        <Link
          href="/benchmarks"
          className="text-sm text-amber-500/50 hover:text-amber-300/80 transition-colors"
        >
          Cancel
        </Link>
      </div>

      {/* Info note */}
      <p className="text-[11px] text-amber-700/30 leading-relaxed">
        Runs execute in GitHub Actions (~2 min). Results appear in the benchmarks list automatically.
      </p>
    </div>
  );
}
