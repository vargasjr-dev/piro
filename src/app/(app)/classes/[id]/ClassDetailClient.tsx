"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassManifest {
  name: string;
  slug: string;
  description?: string;
  hyperparams?: Record<string, number | string | boolean>;
  parameterCount?: number;
  module?: string;
  modelClass?: string;
  configClass?: string;
}

export interface ClassDetailProps {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  manifest: ClassManifest | null;
  hasModule: boolean;
  /** Pre-fetched source shown in preview (also in code tab as default file). */
  source: string | null;
}

type Tab = "preview" | "code";

// ── Known files in the module R2 prefix ───────────────────────────────────────

const MODULE_FILES = [
  { path: "model.py", label: "model.py", language: "python" },
  { path: "manifest.json", label: "manifest.json", language: "json" },
] as const;

// ── File viewer (fetches on demand) ──────────────────────────────────────────

function FileViewer({
  classId,
  filePath,
  preloadedSource,
}: {
  classId: string;
  filePath: string;
  preloadedSource: string | null;
}) {
  const [content, setContent] = useState<string | null>(
    filePath === "model.py" ? preloadedSource : null,
  );
  const [loading, setLoading] = useState(filePath !== "model.py" || preloadedSource === null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    // Use preloaded content for model.py if available
    if (filePath === "model.py" && preloadedSource !== null) {
      setContent(preloadedSource);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setContent(null);

    fetch(`/api/classes/${classId}/file?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((d: { content?: string; truncated?: boolean; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setContent(d.content ?? null);
        setTruncated(d.truncated ?? false);
      })
      .catch(() => setError("Failed to load file"))
      .finally(() => setLoading(false));
  }, [classId, filePath, preloadedSource]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-amber-700/40 animate-pulse">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-red-400/50">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {truncated && (
        <div className="px-4 py-2 border-b border-amber-900/10 text-[10px] text-amber-700/40">
          File truncated at 100 KB
        </div>
      )}
      <pre className="p-5 text-[11.5px] font-mono text-amber-300/65 leading-relaxed whitespace-pre">
        {content}
      </pre>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClassDetailClient({
  id,
  name,
  slug,
  description,
  manifest,
  hasModule,
  source,
}: ClassDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(
    (searchParams.get("tab") as Tab | null) ?? "preview",
  );
  const [selectedFile, setSelectedFile] = useState<string>(
    searchParams.get("file") ?? "model.py",
  );

  function updateUrl(nextTab: Tab, nextFile: string) {
    const params = new URLSearchParams();
    if (nextTab !== "preview") params.set("tab", nextTab);
    if (nextTab === "code" && nextFile !== "model.py") params.set("file", nextFile);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    updateUrl(nextTab, selectedFile);
  }

  function switchFile(nextFile: string) {
    setSelectedFile(nextFile);
    updateUrl(tab, nextFile);
  }

  const paramCount = manifest?.parameterCount ?? null;
  const hyperparams = manifest?.hyperparams ?? null;

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ───────────────────────────────────────────────────── */}
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
            <h1 className="text-amber-100 font-bold text-sm tracking-tight">{name}</h1>
            <p className="text-[11px] text-amber-400/40 mt-0.5 font-mono">{slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab toggle */}
          {hasModule && (
            <div className="flex items-center rounded-lg border border-amber-900/20 overflow-hidden">
              <button
                onClick={() => switchTab("preview")}
                title="Preview"
                className={`px-2.5 py-1.5 transition-colors ${
                  tab === "preview"
                    ? "bg-amber-900/30 text-amber-200/80"
                    : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
                }`}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                </svg>
              </button>
              <button
                onClick={() => switchTab("code")}
                title="Source"
                className={`px-2.5 py-1.5 border-l border-amber-900/20 transition-colors ${
                  tab === "code"
                    ? "bg-amber-900/30 text-amber-200/80"
                    : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
                }`}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                </svg>
              </button>
            </div>
          )}

          <Link
            href={`/training/new?class=${encodeURIComponent(slug)}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
            </svg>
            Train
          </Link>
        </div>
      </div>

      {/* ── Preview tab ──────────────────────────────────────────────── */}
      {tab === "preview" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-2xl space-y-6">

            {/* Seed warning */}
            {!hasModule && (
              <div className="px-4 py-3 rounded-xl border border-amber-700/20 bg-amber-900/10 text-xs text-amber-500/60 leading-relaxed">
                <span className="font-semibold text-amber-400/70">Module not uploaded.</span>{" "}
                Hit{" "}
                <a
                  href="/api/admin/seed-class-modules"
                  target="_blank"
                  className="text-orange-400/60 hover:text-orange-300/80 transition-colors"
                >
                  /api/admin/seed-class-modules
                </a>{" "}
                to upload the Python module to R2.
              </div>
            )}

            {description && (
              <p className="text-sm text-amber-400/60 leading-relaxed">{description}</p>
            )}

          </div>
        </div>
      )}

      {/* ── Code tab ─────────────────────────────────────────────────── */}
      {tab === "code" && (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* File tree */}
          <div className="w-52 shrink-0 border-r border-amber-900/15 overflow-y-auto py-3">
            <p className="px-4 pb-2 text-[9px] font-semibold uppercase tracking-widest text-amber-700/35">
              Files
            </p>
            {MODULE_FILES.map((f) => (
              <button
                key={f.path}
                onClick={() => switchFile(f.path)}
                className={`w-full text-left flex items-center gap-2.5 px-4 py-1.5 text-[12px] font-mono transition-colors ${
                  selectedFile === f.path
                    ? "bg-amber-900/20 text-amber-200/80"
                    : "text-amber-600/50 hover:text-amber-400/70 hover:bg-amber-900/10"
                }`}
              >
                {f.path.endsWith(".py") ? (
                  <svg className="w-3.5 h-3.5 shrink-0 text-orange-500/50" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 shrink-0 text-amber-700/40" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
                  </svg>
                )}
                {f.label}
              </button>
            ))}
          </div>

          {/* File content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0a0806]">
            {/* File tab bar */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-amber-900/10">
              <span className="text-[11px] font-mono text-amber-600/50">{selectedFile}</span>
            </div>
            <FileViewer
              classId={id}
              filePath={selectedFile}
              preloadedSource={source}
            />
          </div>
        </div>
      )}
    </div>
  );
}
