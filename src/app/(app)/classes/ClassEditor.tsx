"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClassEditorInitial {
  id: string;
  name: string;
  slug: string;
  description: string;
  parameterCount: number | null;
  hyperparams: { key: string; value: string }[];
}

interface Props {
  /** When provided, we're editing an existing class (PATCH). Otherwise creating (POST). */
  initial?: ClassEditorInitial;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Hyperparam row ────────────────────────────────────────────────────────────

function HyperRow({
  idx,
  row,
  onChange,
  onRemove,
  isOnly,
}: {
  idx: number;
  row: { key: string; value: string };
  onChange: (idx: number, field: "key" | "value", val: string) => void;
  onRemove: (idx: number) => void;
  isOnly: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={row.key}
        onChange={(e) => onChange(idx, "key", e.target.value)}
        placeholder="key"
        className="flex-1 bg-amber-900/10 border border-amber-900/20 rounded-lg px-3 py-2 text-xs font-mono text-amber-200/80 placeholder-amber-700/30 focus:outline-none focus:border-orange-500/40 transition-colors"
      />
      <span className="text-amber-700/30 text-xs">:</span>
      <input
        type="text"
        value={row.value}
        onChange={(e) => onChange(idx, "value", e.target.value)}
        placeholder="value"
        className="flex-1 bg-amber-900/10 border border-amber-900/20 rounded-lg px-3 py-2 text-xs font-mono text-amber-200/80 placeholder-amber-700/30 focus:outline-none focus:border-orange-500/40 transition-colors"
      />
      <button
        type="button"
        onClick={() => onRemove(idx)}
        disabled={isOnly}
        className="text-amber-700/25 hover:text-red-400/50 transition-colors disabled:opacity-0 p-1"
        title="Remove"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClassEditor({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [paramCount, setParamCount] = useState<string>(
    initial?.parameterCount != null ? String(initial.parameterCount) : "",
  );
  const [hyperparams, setHyperparams] = useState<{ key: string; value: string }[]>(
    initial?.hyperparams.length ? initial.hyperparams : [{ key: "", value: "" }],
  );

  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-derive slug from name until user touches it
  function handleNameChange(val: string) {
    setName(val);
    if (!slugTouched) setSlug(toSlug(val));
  }

  function handleSlugChange(val: string) {
    setSlug(val);
    setSlugTouched(true);
  }

  const updateRow = useCallback(
    (idx: number, field: "key" | "value", val: string) => {
      setHyperparams((rows) =>
        rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)),
      );
    },
    [],
  );

  const removeRow = useCallback((idx: number) => {
    setHyperparams((rows) => rows.filter((_, i) => i !== idx));
  }, []);

  function addRow() {
    setHyperparams((rows) => [...rows, { key: "", value: "" }]);
  }

  async function handleSave() {
    if (!name.trim()) { setErrorMsg("Name is required"); return; }
    if (!slug.trim()) { setErrorMsg("Slug is required"); return; }

    // Build configJson from non-empty rows
    const config: Record<string, number | string> = {};
    for (const { key, value } of hyperparams) {
      if (!key.trim()) continue;
      const num = Number(value);
      config[key.trim()] = isNaN(num) || value.trim() === "" ? value : num;
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      parameterCount: paramCount.trim() ? Number(paramCount) : null,
      configJson: Object.keys(config).length > 0 ? JSON.stringify(config) : null,
    };

    setStatus("saving");
    setErrorMsg(null);

    try {
      const res = await fetch(
        isEdit ? `/api/classes/${initial!.id}` : "/api/classes",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      router.push("/classes");
      router.refresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  const canSave = name.trim().length > 0 && slug.trim().length > 0 && status !== "saving";

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/classes"
            className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-amber-100 font-bold text-sm tracking-tight">
              {isEdit ? (name || "Edit Class") : "New Class"}
            </h1>
            <p className="text-xs text-amber-400/40 mt-0.5">
              {isEdit ? "Edit architecture definition" : "Define a model architecture"}
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === "saving" ? (
            <>
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {isEdit ? "Save" : "Create"}
            </>
          )}
        </button>
      </div>

      {/* ── Form ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-lg space-y-6">

          {/* Error */}
          {errorMsg && (
            <p className="text-xs text-red-400/70 bg-red-900/10 border border-red-900/20 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Continuous Thought Model"
              className="w-full bg-amber-900/10 border border-amber-900/20 rounded-xl px-4 py-2.5 text-sm text-amber-100 placeholder-amber-700/30 focus:outline-none focus:border-orange-500/40 transition-colors"
            />
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
              Slug <span className="normal-case font-normal text-amber-700/30">— maps to modelTemplate in trainer</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="e.g. ctm"
              className="w-full bg-amber-900/10 border border-amber-900/20 rounded-xl px-4 py-2.5 text-sm font-mono text-amber-300/80 placeholder-amber-700/30 focus:outline-none focus:border-orange-500/40 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes this architecture different?"
              rows={3}
              className="w-full bg-amber-900/10 border border-amber-900/20 rounded-xl px-4 py-2.5 text-sm text-amber-200/70 placeholder-amber-700/30 focus:outline-none focus:border-orange-500/40 transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Parameter count */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
              Parameter count <span className="normal-case font-normal text-amber-700/30">— optional, manual</span>
            </label>
            <input
              type="number"
              value={paramCount}
              onChange={(e) => setParamCount(e.target.value)}
              placeholder="e.g. 870"
              min={0}
              className="w-full bg-amber-900/10 border border-amber-900/20 rounded-xl px-4 py-2.5 text-sm font-mono text-amber-200/70 placeholder-amber-700/30 focus:outline-none focus:border-orange-500/40 transition-colors"
            />
          </div>

          {/* Hyperparams */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
                Hyperparameters
              </label>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 text-[10px] text-amber-600/40 hover:text-orange-400/60 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add param
              </button>
            </div>
            <div className="space-y-2">
              {hyperparams.map((row, idx) => (
                <HyperRow
                  key={idx}
                  idx={idx}
                  row={row}
                  onChange={updateRow}
                  onRemove={removeRow}
                  isOnly={hyperparams.length === 1}
                />
              ))}
            </div>
            {/* Preview */}
            {hyperparams.some((r) => r.key.trim()) && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-amber-900/8 border border-amber-900/15">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-700/30 mb-1.5">Preview</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {hyperparams.filter((r) => r.key.trim()).map((r) => (
                    <span key={r.key} className="text-[10px] font-mono">
                      <span className="text-amber-700/40">{r.key}</span>
                      <span className="text-amber-700/25 mx-0.5">:</span>
                      <span className="text-amber-300/60 font-semibold">{r.value || "?"}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
