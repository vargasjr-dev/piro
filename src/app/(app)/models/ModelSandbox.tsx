"use client";

import { useState } from "react";

type SandboxMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sentAt: number;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
  pending?: boolean;
  error?: boolean;
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
  metadata?: Record<string, unknown> | null;
  error?: string;
};

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  // Truncate to match the measured request duration without overstating it.
  return `${(Math.floor(durationMs / 100) / 10).toFixed(1)}s`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatModelOutput(
  text: string,
  metadata: Record<string, unknown> | null,
): string {
  if (metadata?.outputFormat !== "token-id") return text || "(empty response)";
  const tokenId =
    typeof metadata.tokenId === "number" ? ` ${metadata.tokenId}` : "";
  const vocabSize =
    typeof metadata.vocabSize === "number" ? ` / ${metadata.vocabSize}` : "";
  return `${text || "(empty response)"} (raw token ID:${tokenId.trim() || "unknown"}${vocabSize})`;
}

export default function ModelSandbox({ modelId, more }: ModelSandboxProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<SandboxMessage[]>([]);
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invoke() {
    const text = prompt.trim();
    if (!text || submitting) return;

    const sentAt = Date.now();
    const userMessageId = `${sentAt}-user`;
    const assistantMessageId = `${sentAt}-assistant`;
    setPrompt("");
    setSubmitting(true);
    setError(null);
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text, sentAt },
      {
        id: assistantMessageId,
        role: "assistant",
        text: "",
        sentAt,
        pending: true,
      },
    ]);

    function finishAssistant(update: Omit<SandboxMessage, "id" | "role">) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, ...update, pending: false }
            : message,
        ),
      );
    }

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
      const responseText = await response.text();
      let body: InferResponse | null = null;
      try {
        body = JSON.parse(responseText) as InferResponse;
      } catch {
        // Surface a useful HTTP error when the server returns a non-JSON failure page.
      }
      if (!response.ok) {
        const message =
          body?.error ?? `Inference failed (HTTP ${response.status})`;
        setError(message);
        finishAssistant({
          text: message,
          sentAt: Date.now(),
          error: true,
        });
        return;
      }
      if (!body) {
        const message = "Inference returned an invalid response.";
        setError(message);
        finishAssistant({ text: message, sentAt: Date.now(), error: true });
        return;
      }

      const output =
        body.output?.parts
          ?.filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join(" ") ?? "";
      const receivedAt = Date.now();
      finishAssistant({
        text: formatModelOutput(output, body.metadata ?? null),
        sentAt: receivedAt,
        durationMs: body.durationMs ?? null,
        metadata: body.metadata ?? null,
      });
      setState(body.state ?? null);
    } catch {
      const message =
        "We could not reach the inference service. Please try again.";
      setError(message);
      finishAssistant({ text: message, sentAt: Date.now(), error: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-orange-500/25 bg-[#17100b] p-4 shadow-[0_0_80px_rgba(249,115,22,0.07)] sm:p-6">
      {messages.length > 0 && (
        <div className="mb-6 space-y-4 border-b border-amber-900/20 pb-5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`group flex items-center gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <time
                  dateTime={new Date(message.sentAt).toISOString()}
                  className="w-20 shrink-0 text-right text-[10px] text-amber-500/0 transition group-hover:text-amber-500/65"
                >
                  {formatTimestamp(message.sentAt)}
                </time>
              )}
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "rounded-br-md bg-orange-500 text-[#180d07]"
                    : "rounded-bl-md border border-amber-900/25 bg-[#0e0b09] text-amber-50"
                }`}
              >
                <p
                  aria-live={message.pending ? "polite" : undefined}
                  className={`whitespace-pre-wrap text-sm leading-relaxed ${
                    message.pending
                      ? "animate-pulse text-amber-300/70"
                      : message.error
                        ? "text-rose-300"
                        : ""
                  }`}
                >
                  {message.pending ? "Thinking…" : message.text}
                </p>
                {message.role === "assistant" &&
                  !message.pending &&
                  message.durationMs !== undefined &&
                  message.durationMs !== null && (
                    <p className="mt-2 text-[10px] text-amber-500/45">
                      {formatDuration(message.durationMs)}
                    </p>
                  )}
              </div>
              {message.role === "user" && (
                <time
                  dateTime={new Date(message.sentAt).toISOString()}
                  className="w-20 shrink-0 text-[10px] text-amber-500/0 transition group-hover:text-amber-500/65"
                >
                  {formatTimestamp(message.sentAt)}
                </time>
              )}
            </div>
          ))}
        </div>
      )}

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
    </section>
  );
}
