"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ClassOption {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parameterCount: number | null;
}

interface DataSourceOption {
  id: string;
  name: string;
  description: string | null;
}

export default function NewTrainingForm() {
  const router = useRouter();
  const [modelName, setModelName] = useState("");
  const [modelTemplate, setModelTemplate] = useState("");
  const [dataSource, setDataSource] = useState("");
  const [epochs, setEpochs] = useState(10);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);

  useEffect(() => {
    // Fetch model classes from DB (lazy-seeds defaults on first call)
    fetch("/api/classes")
      .then((r) => r.json())
      .then((d: { classes: ClassOption[] }) => {
        setClasses(d.classes);
        if (d.classes.length > 0) setModelTemplate(d.classes[0].slug);
      })
      .catch(() => {})
      .finally(() => setClassesLoading(false));

    fetch("/api/data-sources")
      .then((r) => r.json())
      .then((d: { sources: DataSourceOption[] }) => {
        setDataSources(d.sources);
        if (d.sources.length > 0) setDataSource(d.sources[0].id);
      })
      .catch(() => {});
  }, []);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/training-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: modelName.trim() || undefined, modelTemplate, dataSource, epochs }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to start run");
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/training/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("idle");
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-lg">
      {/* Model name */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
          Model Name
        </h2>
        <input
          type="text"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="e.g. my-ctm-v1 (optional)"
          className="w-full px-4 py-2.5 rounded-xl border border-amber-900/20 bg-amber-900/5 text-sm text-amber-100 placeholder:text-amber-700/30 focus:outline-none focus:border-orange-500/50 focus:bg-orange-500/5 transition-colors"
        />
        <p className="text-[11px] text-amber-700/30">
          A label for the model row created when training completes.
        </p>
      </div>

      {/* Model class */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
              Class
            </h2>
            <a href="/classes" className="text-[11px] text-amber-600/40 hover:text-amber-400/60 transition-colors">
              Browse classes →
            </a>
          </div>
          <div className="space-y-2">
            {classesLoading ? (
              <>
                <div className="h-14 rounded-xl border border-amber-900/20 bg-amber-900/5 animate-pulse" />
                <div className="h-14 rounded-xl border border-amber-900/20 bg-amber-900/5 animate-pulse" />
              </>
            ) : classes.length === 0 ? (
              <p className="text-xs text-amber-700/30 px-1">No classes found</p>
            ) : (
              classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setModelTemplate(c.slug)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    modelTemplate === c.slug
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${modelTemplate === c.slug ? "text-amber-100" : "text-amber-200/60"}`}>
                      {c.name}
                    </p>
                    {c.parameterCount != null && (
                      <span className="text-[10px] font-mono text-amber-700/40">
                        {c.parameterCount.toLocaleString()} params
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-[11px] text-amber-600/40 mt-0.5 leading-snug">{c.description}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

      {/* Data source */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
            Data Source
          </h2>
          <a href="/sources" className="text-[11px] text-amber-600/40 hover:text-amber-400/60 transition-colors">
            Manage sources →
          </a>
        </div>
        <div className="space-y-2">
          {dataSources.length === 0 ? (
            <p className="text-xs text-amber-700/30 px-1">Loading…</p>
          ) : (
            dataSources.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setDataSource(s.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  dataSource === s.id
                    ? "border-orange-500/50 bg-orange-500/10"
                    : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
                }`}
              >
                <p className={`text-sm font-semibold ${dataSource === s.id ? "text-amber-100" : "text-amber-200/60"}`}>
                  {s.name}
                </p>
                {s.description && (
                  <p className="text-[11px] text-amber-600/40 mt-0.5">{s.description}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Epochs */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
          Epochs
        </h2>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={100}
            value={epochs}
            onChange={(e) => setEpochs(Number(e.target.value))}
            className="flex-1 accent-orange-500"
          />
          <span className="text-sm font-mono text-amber-200/80 w-8 text-right">{epochs}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400/70 bg-red-900/10 border border-red-900/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={status === "loading"}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-500/40 text-sm font-semibold text-amber-100 hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Queuing…
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
        <button
          type="button"
          onClick={() => router.push("/training")}
          className="text-sm text-amber-500/50 hover:text-amber-300/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
