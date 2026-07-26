"use client";

import { useState } from "react";

type SandboxMessage = {
  prompt: string;
  output: string;
  durationMs: number | null;
};

type ModelMore = {
  apiExample: string;
  isGlobal: boolean;
  parameterCount: string;
  deployedAt: string;
  access: string;
};

type ModelSandboxProps = {
  modelId: string;
  more: ModelMore;
};

type InferResponse = {
  output?: {
    parts?: Array<{ type?: string; text?: string }>;
  };
  state?: Record<string, unknown> | null;
  durationMs?: number;
  error?: string;
};

export default function ModelSandbox({ modelId, more }: ModelSandboxProps) {
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
      <div>
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
          placeholder="Message your model…"
          rows={3}
          aria-label="Message your model"
          className="w-full resize-none rounded-2xl border border-amber-800/40 bg-[#0e0b09] px-4 py-3 text-base leading-relaxed text-amber-50 outline-none transition placeholder:text-amber-700/50 focus:border-orange-400/70 focus:ring-2 focus:ring-orange-400/15"
        />
        <div className="mt-3 flex items-start justify-between gap-3">
          <details className="group min-w-0 flex-1">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-amber-300/70 outline-none transition hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-orange-400/70 marker:hidden [&::-webkit-details-marker]:hidden">
              <span>More</span>
              <span className="text-xs text-amber-500/50 transition group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <div className="mt-3 space-y-4 rounded-2xl border border-amber-900/30 bg-[#13100c] p-4">
              {more.isGlobal && (
                <div
                  role="alert"
                  className="rounded-2xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 text-sm leading-relaxed text-orange-100/80"
                >
                  <strong className="font-bold text-orange-200">
                    Shared model:
                  </strong>{" "}
                  Not for production workloads or sensitive data.
                </div>
              )}

              <pre className="overflow-x-auto rounded-xl border border-amber-900/25 bg-[#0b0908] p-4 text-[11px] leading-relaxed text-amber-200/80">
                <code>{more.apiExample}</code>
              </pre>

              <dl className="space-y-3 rounded-2xl border border-amber-900/30 bg-[#0e0b09] p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-amber-400/50">Parameters</dt>
                  <dd className="text-right text-amber-100/80">
                    {more.parameterCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-amber-400/50">Deployed</dt>
                  <dd className="text-right text-amber-100/80">
                    {more.deployedAt}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-amber-400/50">Access</dt>
                  <dd className="text-right text-amber-100/80">
                    {more.access}
                  </dd>
                </div>
              </dl>
            </div>
          </details>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-amber-600/50 sm:inline">
              ⌘ / Ctrl + Enter
            </span>
            <button
              type="button"
              onClick={() => void invoke()}
              disabled={submitting || !prompt.trim()}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-[#180d07] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Thinking…" : "Send"}
            </button>
          </div>
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
