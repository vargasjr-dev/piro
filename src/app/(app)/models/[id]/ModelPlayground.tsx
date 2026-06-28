"use client";

import { useState, useRef, type FormEvent } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InferResponse {
  text: string;
  durationMs: number;
  error?: string;
}

// ── Preset prompts ────────────────────────────────────────────────────────────

const PRESETS = [
  "Sort the numbers [3, 1, 4, 1, 5, 9, 2, 6] in ascending order.",
  "Find the smallest element in [7, 2, 9, 1, 5].",
  "Sort [64, 25, 12, 22, 11] and show each step.",
  "Reverse the list [1, 2, 3, 4, 5].",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ModelPlayground({
  modelId,
  inferenceReady,
}: {
  modelId: string;
  inferenceReady: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!inferenceReady) {
    return (
      <div className="px-4 py-6 rounded-xl border border-amber-900/20 bg-amber-900/5 text-center">
        <p className="text-xs text-amber-600/40">Inference not available</p>
        <p className="text-[10px] text-amber-700/30 mt-1">
          Retrain this model to enable the playground.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setResponse(null);
    setError(null);
    setDuration(null);

    try {
      const res = await fetch(`/api/models/${modelId}/infer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = (await res.json()) as InferResponse;

      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
      } else if (data.error) {
        setError(data.error);
      } else {
        setResponse(data.text);
        setDuration(data.durationMs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(preset: string) {
    setPrompt(preset);
    setResponse(null);
    setError(null);
    textareaRef.current?.focus();
  }

  function copyResponse() {
    if (response && navigator.clipboard) {
      navigator.clipboard.writeText(response);
    }
  }

  return (
    <div className="space-y-3">
      {/* Prompt input */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a prompt for this model..."
          rows={3}
          className="w-full bg-amber-950/30 border border-amber-900/25 rounded-xl px-3 py-2.5
                     text-xs text-amber-200/70 placeholder-amber-800/30
                     focus:outline-none focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/20
                     resize-none transition-colors"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit(e);
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          {/* Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className="text-[10px] px-2 py-1 rounded-lg
                           border border-amber-900/20 text-amber-600/50
                           hover:border-amber-700/30 hover:text-amber-400/60
                           transition-colors truncate max-w-[120px]"
              >
                {p.length > 24 ? p.slice(0, 24) + "…" : p}
              </button>
            ))}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-orange-500/15 border border-orange-500/30 text-orange-400/80
                       hover:bg-orange-500/25 hover:text-orange-300/90
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                    strokeDasharray="31.4 31.4" strokeLinecap="round" />
                </svg>
                Running…
              </span>
            ) : (
                            <span className="flex items-center gap-1.5">
                              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                              </svg>
                              Run
                            </span>
                          )}
                        </button>
        </div>
        <p className="text-[10px] text-amber-800/30">
          Press ⌘⏎ or Ctrl⏎ to run
        </p>
      </form>

      {/* Response */}
      {loading && (
        <div className="px-4 py-6 rounded-xl border border-amber-900/20 bg-amber-950/30 animate-pulse">
          <div className="h-3 bg-amber-900/20 rounded w-3/4 mb-2" />
          <div className="h-3 bg-amber-900/15 rounded w-1/2" />
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl border border-red-900/30 bg-red-950/20">
          <p className="text-xs text-red-400/70 font-mono">{error}</p>
        </div>
      )}

      {response !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-amber-400/40 uppercase tracking-widest">
                Response
              </span>
              {duration !== null && (
                <span className="text-[10px] font-mono text-amber-600/50">
                  {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
            <button
              onClick={copyResponse}
              className="text-[10px] text-amber-600/40 hover:text-amber-400/60 transition-colors"
            >
              Copy
            </button>
          </div>
          <div className="px-4 py-3 rounded-xl border border-amber-900/20 bg-amber-950/30">
            <pre className="text-xs text-amber-200/70 font-mono whitespace-pre-wrap break-words leading-relaxed">
              {response}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
