"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type ComponentKind = "source" | "benchmark";
type Tab = "overview" | "code";

export function RepositoryComponentDetail({
  kind,
  name,
  path,
  entrypoint,
  source,
  actionEndpoint,
  actionLabel,
}: {
  kind: ComponentKind;
  name: string;
  path: string;
  entrypoint: string;
  source: string | null;
  actionEndpoint: string;
  actionLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    requestedTab === "code" ? "code" : "overview",
  );
  const [status, setStatus] = useState<
    "idle" | "working" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "overview") params.delete("tab");
    else params.set("tab", nextTab);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  async function runAction() {
    setStatus("working");
    setMessage(null);
    try {
      const response = await fetch(actionEndpoint, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Unable to start this job.");
      setStatus("success");
      setMessage(body.message ?? `${actionLabel} started.`);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Unable to start this job.",
      );
    }
  }

  const isSource = kind === "source";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center rounded-lg border border-amber-900/20 overflow-hidden">
          <button
            type="button"
            onClick={() => switchTab("overview")}
            className={`px-3 py-1.5 text-xs transition-colors ${
              tab === "overview"
                ? "bg-amber-900/30 text-amber-200/80"
                : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => switchTab("code")}
            className={`px-3 py-1.5 border-l border-amber-900/20 text-xs transition-colors ${
              tab === "code"
                ? "bg-amber-900/30 text-amber-200/80"
                : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
            }`}
          >
            Source code
          </button>
        </div>
      </div>

      {tab === "code" ? (
        <pre className="rounded-xl border border-amber-900/20 bg-[#13100c] p-4 overflow-x-auto text-xs leading-relaxed text-amber-200/70 font-mono">
          <code>{source ?? "Source unavailable."}</code>
        </pre>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
                Component
              </p>
              <p className="mt-1 text-sm text-amber-200/80">
                {isSource
                  ? "A data source produces training examples that can be materialized as a dataset."
                  : "A benchmark defines an evaluation protocol for comparing model behavior."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
                  Path
                </p>
                <p className="mt-1 text-xs font-mono text-amber-300/60 break-all">
                  {path}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
                  Entrypoint
                </p>
                <p className="mt-1 text-xs font-mono text-amber-300/60">
                  {entrypoint}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-amber-100">
                  {isSource ? "Materialize this source" : "Run this evaluation"}
                </h3>
                <p className="mt-1 text-xs text-amber-400/45">
                  {isSource
                    ? "Execute the source and save its generated examples as a dataset."
                    : "Start an evaluation run against the available model targets."}
                </p>
              </div>
              <button
                type="button"
                onClick={runAction}
                disabled={status === "working"}
                className="shrink-0 rounded-lg bg-orange-500/15 px-3 py-2 text-xs font-medium text-orange-300 transition-colors hover:bg-orange-500/25 disabled:cursor-wait disabled:opacity-50"
              >
                {status === "working" ? "Starting…" : actionLabel}
              </button>
            </div>
            {message && (
              <p
                className={`mt-3 text-xs ${
                  status === "error" ? "text-red-300/70" : "text-emerald-300/70"
                }`}
              >
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
