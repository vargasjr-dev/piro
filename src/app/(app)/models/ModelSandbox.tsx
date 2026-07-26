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
    <section className="rounded-3xl border border-orange-500/25 bg-[#17100b] p-4 shadow-[0_0_80px_rgba(249,115,22,0.07)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-xl font-black text-amber-50 sm:text-2xl">
          Chat with {modelName}
        </h2>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            ready
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              : "border-amber-700/30 bg-amber-900/15 text-amber-400/65"
          }`}
        >
          {ready ? "Ready" : "Preparing"}
        </span>
      </div>

      <div className="mt-4">
        <textarea
          id="chat-prompt"
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
          placeholder="Message your model…"
          rows={3}
          aria-label="Message your model"
          className="w-full resize-none rounded-2xl border border-amber-800/40 bg-[#0e0b09] px-4 py-3 text-base leading-relaxed text-amber-50 outline-none transition placeholder:text-amber-700/50 focus:border-orange-400/70 focus:ring-2 focus:ring-orange-400/15 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="hidden text-xs text-amber-600/50 sm:inline">
            ⌘ / Ctrl + Enter
          </span>
          <button
            type="button"
            onClick={() => void invoke()}
            disabled={!ready || submitting || !prompt.trim()}
            className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-[#180d07] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Thinking…" : "Send"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>

      {messages.length > 0 && (
        <div className="mt-6 space-y-4 border-t border-amber-900/20 pt-5">
          {messages.map((message, index) => (
            <div key={`${message.prompt}-${index}`} className="space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-orange-500 px-4 py-3 text-sm leading-relaxed text-[#180d07]">
                  {message.prompt}
                </p>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-amber-900/25 bg-[#0e0b09] px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-50">
                    {message.output || "(empty response)"}
                  </p>
                  {message.durationMs !== null && (
                    <p className="mt-2 text-[10px] text-amber-500/45">
                      {message.durationMs} ms
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
