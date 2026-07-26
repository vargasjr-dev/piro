"use client";

import { useState } from "react";

type SandboxMessage = {
  prompt: string;
  output: string;
  durationMs: number | null;
};

type ModelSandboxProps = {
  modelId: string;
  modelName: string;
  ready: boolean;
};

type InferResponse = {
  output?: {
    parts?: Array<{ type?: string; text?: string }>;
  };
  state?: Record<string, unknown> | null;
  durationMs?: number;
  error?: string;
};

export default function ModelSandbox({
  modelId,
  modelName,
  ready,
}: ModelSandboxProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<SandboxMessage[]>([]);
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invoke() {
    const text = prompt.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/models/${encodeURIComponent(modelId)}/infer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: [{ type: "text", text }],
            state,
          }),
        },
      );
      const body = (await response.json()) as InferResponse;
      if (!response.ok) {
        setError(body.error ?? "Inference failed");
        return;
      }

      const output =
        body.output?.parts
          ?.filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join(" ") ?? "";
      setMessages((current) => [
        ...current,
        { prompt: text, output, durationMs: body.durationMs ?? null },
      ]);
      setState(body.state ?? null);
      setPrompt("");
    } catch {
      setError("We could not reach Piro. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-orange-500/25 bg-[#17100b] p-6 shadow-[0_0_80px_rgba(249,115,22,0.07)] sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">
            Sandbox
          </p>
          <h2 className="mt-3 text-2xl font-black text-amber-50">
            Invoke {modelName}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-amber-200/55">
            Send an observation directly to this deployment. Piro carries the
            model state forward between requests in this sandbox.
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            ready
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              : "border-amber-700/30 bg-amber-900/15 text-amber-400/65"
          }`}
        >
          {ready ? "Ready" : "Preparing"}
        </span>
      </div>

      <div className="mt-8 space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-900/30 bg-[#0e0b09] p-5 text-sm text-amber-300/50">
            Try:{" "}
            <span className="text-amber-100/75">
              Remember that I prefer concise answers.
            </span>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.prompt}-${index}`} className="space-y-3">
              <div className="rounded-2xl border border-amber-900/25 bg-[#0e0b09] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-500/55">
                  Observation
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-amber-100/85">
                  {message.prompt}
                </p>
              </div>
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300/70">
                    Output
                  </p>
                  {message.durationMs !== null && (
                    <span className="text-[10px] text-amber-500/45">
                      {message.durationMs} ms
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-amber-50">
                  {message.output || "(empty output)"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6">
        <label
          htmlFor="sandbox-prompt"
          className="text-xs font-bold uppercase tracking-[0.16em] text-amber-500/70"
        >
          Observation
        </label>
        <textarea
          id="sandbox-prompt"
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void invoke();
            }
          }}
          disabled={!ready || submitting}
          placeholder="Tell your model something…"
          rows={4}
          className="mt-2 w-full resize-y rounded-2xl border border-amber-800/40 bg-[#0e0b09] px-4 py-3 text-base leading-relaxed text-amber-50 outline-none transition placeholder:text-amber-700/50 focus:border-orange-400/70 focus:ring-2 focus:ring-orange-400/15 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-amber-600/50">
            ⌘ / Ctrl + Enter to invoke
          </p>
          <button
            type="button"
            onClick={() => void invoke()}
            disabled={!ready || submitting || !prompt.trim()}
            className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-[#180d07] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Invoking…" : "Invoke model"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
