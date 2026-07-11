"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArchitectureGraph,
  type ArchitectureGraphData,
} from "~/components/ArchitectureGraph";

interface ArchitectureManifest {
  name: string;
  slug: string;
  description?: string;
  hyperparams?: Record<string, number | string | boolean>;
  parameterCount?: number;
  module?: string;
  modelClass?: string;
  graph?: ArchitectureGraphData;
}

type Tab = "preview" | "code";

export function ArchitectureDetail({
  source,
  serializeUrl,
}: {
  source: string | null;
  serializeUrl: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    requestedTab === "code" ? "code" : "preview",
  );
  const [manifest, setManifest] = useState<ArchitectureManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setTab(requestedTab === "code" ? "code" : "preview");
  }, [requestedTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setManifest(null);

    fetch(serializeUrl, {
      signal: AbortSignal.timeout(60_000),
    })
      .then(async (response) => {
        const body = (await response.json()) as ArchitectureManifest & {
          error?: string;
          detail?: string;
        };
        if (!response.ok) {
          throw new Error(
            body.detail ??
              body.error ??
              "Unable to serialize this architecture.",
          );
        }
        return body;
      })
      .then((body) => {
        if (!cancelled) setManifest(body);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          const message =
            reason instanceof DOMException && reason.name === "TimeoutError"
              ? "Architecture serialization timed out. Please try again."
              : reason instanceof Error
                ? reason.message
                : "Unable to serialize this architecture.";
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [serializeUrl, retryCount]);

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "preview") params.delete("tab");
    else params.set("tab", nextTab);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  const graph = manifest?.graph;
  const hyperparams = manifest?.hyperparams
    ? Object.entries(manifest.hyperparams)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center rounded-lg border border-amber-900/20 overflow-hidden">
          <button
            type="button"
            onClick={() => switchTab("preview")}
            className={`px-3 py-1.5 text-xs transition-colors ${
              tab === "preview"
                ? "bg-amber-900/30 text-amber-200/80"
                : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
            }`}
          >
            Preview
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
            Code
          </button>
        </div>
      </div>

      {tab === "code" ? (
        <pre className="rounded-xl border border-amber-900/20 bg-[#13100c] p-4 overflow-x-auto text-xs leading-relaxed text-amber-200/70 font-mono">
          <code>{source ?? "Source unavailable."}</code>
        </pre>
      ) : loading ? (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-12 text-center text-sm text-amber-500/50 animate-pulse">
          Serializing architecture…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/20 bg-red-950/10 px-4 py-5 text-sm text-red-300/60">
          <p className="font-medium text-red-300/75">Preview unavailable</p>
          <p className="mt-1 text-xs leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="mt-4 rounded-md border border-red-900/30 px-3 py-1.5 text-xs text-red-300/75 transition-colors hover:bg-red-900/20"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {manifest?.description && (
            <p className="text-sm text-amber-400/60 leading-relaxed">
              {manifest.description}
            </p>
          )}

          {(manifest?.parameterCount !== undefined ||
            hyperparams.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {manifest && manifest.parameterCount !== undefined && (
                <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-3">
                  <p className="text-lg font-semibold text-amber-100">
                    {manifest.parameterCount.toLocaleString()}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
                    Parameters
                  </p>
                </div>
              )}
              {manifest && hyperparams.length > 0 && (
                <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-3">
                  <p className="text-lg font-semibold text-amber-100">
                    {hyperparams.length}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
                    Hyperparameters
                  </p>
                </div>
              )}
            </div>
          )}

          {manifest && hyperparams.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50 mb-3">
                Configuration
              </h3>
              <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 divide-y divide-amber-900/10">
                {hyperparams.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs"
                  >
                    <span className="font-mono text-amber-600/55">{key}</span>
                    <span className="font-mono text-amber-200/65">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {graph ? (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50 mb-3">
                Architecture
              </h3>
              <ArchitectureGraph graph={graph} />
            </div>
          ) : (
            <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-8 text-center text-sm text-amber-500/50">
              This architecture does not expose a serializable graph.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
