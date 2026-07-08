"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DatasetOption {
  id: string;
  name: string;
  sourcePath: string;
  sampleCount: number | null;
}

export default function NewTrainingForm() {
  const router = useRouter();
  const [modelName, setModelName] = useState("");
  const [architecturePath, setArchitecturePath] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [epochs, setEpochs] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch all repos and their datasets
    (async () => {
      try {
        const reposRes = await fetch("/api/repos");
        if (!reposRes.ok) return;
        const { repos } = await reposRes.json();

        // Fetch datasets for each repo
        const datasetLists = await Promise.all(
          repos.map(async (repo: { id: string }) => {
            const res = await fetch(`/api/repos/${repo.id}`);
            if (!res.ok) return [];
            const { datasets } = await res.json();
            return datasets;
          }),
        );

        setDatasets(datasetLists.flat());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!architecturePath || !datasetId) {
      setError("Select an architecture and dataset");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/training-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: modelName.trim() || undefined, architecturePath, datasetId, epochs }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start training run");
        setSubmitting(false);
        return;
      }

      const { id } = await res.json();
      router.push(`/training/${id}`);
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-amber-100">New Training Run</h1>
        <p className="text-sm text-amber-600/40 mt-1">
          Train an architecture from your repo against a generated dataset.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Architecture path */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
            Architecture
          </label>
          <input
            type="text"
            value={architecturePath}
            onChange={(e) => setArchitecturePath(e.target.value)}
            placeholder="architectures/ctm"
            className="w-full px-4 py-3 rounded-xl bg-amber-950/20 border border-amber-900/30 text-amber-100 text-sm font-mono placeholder:text-amber-700/30 focus:outline-none focus:border-orange-500/50"
          />
          <p className="text-xs text-amber-600/40">
            Path in your repo to the architecture (convention: architectures/{"<name>"}/main.py)
          </p>
        </div>

        {/* Dataset */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
            Dataset
          </label>
          {loading ? (
            <p className="text-sm text-amber-600/40">Loading datasets…</p>
          ) : datasets.length === 0 ? (
            <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 px-4 py-3">
              <p className="text-sm text-amber-500/50">No datasets generated yet.</p>
              <p className="text-xs text-amber-600/30 mt-1">
                Generate a dataset from a source script first: piro sources generate
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {datasets.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDatasetId(d.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    datasetId === d.id
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-amber-900/30 bg-amber-950/20 hover:border-amber-700/40"
                  }`}
                >
                  <p className={`text-sm font-semibold ${datasetId === d.id ? "text-amber-100" : "text-amber-200/60"}`}>
                    {d.name}
                  </p>
                  <p className="text-xs text-amber-600/40 mt-0.5">
                    {d.sourcePath}
                    {d.sampleCount ? ` · ${d.sampleCount.toLocaleString()} samples` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Model name */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
            Model Name <span className="text-amber-600/30 normal-case">(optional)</span>
          </label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="ctm-sort-v1"
            className="w-full px-4 py-3 rounded-xl bg-amber-950/20 border border-amber-900/30 text-amber-100 text-sm placeholder:text-amber-700/30 focus:outline-none focus:border-orange-500/50"
          />
        </div>

        {/* Epochs */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest">
            Epochs
          </label>
          <input
            type="number"
            value={epochs}
            onChange={(e) => setEpochs(Number(e.target.value))}
            min={1}
            max={100}
            className="w-32 px-4 py-3 rounded-xl bg-amber-950/20 border border-amber-900/30 text-amber-100 text-sm focus:outline-none focus:border-orange-500/50"
          />
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting || !architecturePath || !datasetId}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-500/30 bg-orange-500/10 text-sm font-semibold text-amber-100 hover:bg-orange-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Starting…" : (
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
      </form>
    </div>
  );
}
