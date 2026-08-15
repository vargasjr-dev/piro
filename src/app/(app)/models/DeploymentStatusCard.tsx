"use client";

import { useEffect, useState } from "react";

type DeploymentStatus = "ready" | "sleeping" | "starting" | "unavailable";

type StatusResponse = {
  status?: DeploymentStatus;
  runnerCount?: number;
  retryAfterMs?: number;
  detail?: string;
};

const POLL_INTERVAL_MS = 5_000;
const WAKE_TIMEOUT_MS = 300_000;

const statusCopy: Record<
  DeploymentStatus,
  { label: string; detail: string; color: string }
> = {
  ready: {
    label: "Ready",
    detail: "Gemma is awake and ready for requests.",
    color: "text-emerald-300",
  },
  sleeping: {
    label: "Sleeping",
    detail: "No Gemma container is running right now.",
    color: "text-amber-200",
  },
  starting: {
    label: "Starting",
    detail: "Gemma is waking up. This can take a few minutes.",
    color: "text-orange-300",
  },
  unavailable: {
    label: "Unavailable",
    detail: "We could not confirm the deployment status.",
    color: "text-rose-300",
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function DeploymentStatusCard({ modelId }: { modelId: string }) {
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const [runnerCount, setRunnerCount] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [waking, setWaking] = useState(false);

  async function requestStatus(wake: boolean): Promise<StatusResponse> {
    const response = await fetch(
      `/api/models/${encodeURIComponent(modelId)}/status`,
      {
        method: wake ? "POST" : "GET",
      },
    );
    const body = (await response
      .json()
      .catch(() => null)) as StatusResponse | null;
    if (!response.ok) {
      throw new Error(body?.detail ?? "Deployment status unavailable");
    }
    return body ?? {};
  }

  function applyStatus(body: StatusResponse) {
    setStatus(body.status ?? "unavailable");
    setRunnerCount(
      typeof body.runnerCount === "number" ? body.runnerCount : null,
    );
    setDetail(body.detail ?? null);
  }

  async function refresh() {
    setLoading(true);
    try {
      applyStatus(await requestStatus(false));
    } catch (error) {
      setStatus("unavailable");
      setDetail(error instanceof Error ? error.message : null);
    } finally {
      setLoading(false);
    }
  }

  async function wake() {
    if (waking || status === "ready") return;
    setWaking(true);
    setLoading(true);
    const startedAt = Date.now();
    try {
      let body = await requestStatus(true);
      applyStatus(body);
      while (
        body.status === "starting" &&
        Date.now() - startedAt < WAKE_TIMEOUT_MS
      ) {
        await sleep(Math.max(POLL_INTERVAL_MS, body.retryAfterMs ?? 0));
        body = await requestStatus(false);
        applyStatus(body);
      }
    } catch (error) {
      setStatus("unavailable");
      setDetail(error instanceof Error ? error.message : null);
    } finally {
      setWaking(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [modelId]);

  const currentStatus = status ?? "starting";
  const copy = statusCopy[currentStatus];
  const actionLabel = waking
    ? "Waking…"
    : currentStatus === "sleeping"
      ? "Wake"
      : "Refresh";

  return (
    <section
      aria-label="Deployment status"
      className="mb-4 rounded-2xl border border-amber-900/30 bg-[#13100c] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              currentStatus === "ready"
                ? "bg-emerald-400"
                : currentStatus === "unavailable"
                  ? "bg-rose-400"
                  : "bg-orange-400"
            } ${loading ? "animate-pulse" : ""}`}
          />
          <div className="min-w-0">
            <p className={`text-sm font-bold ${copy.color}`}>
              Deployment {copy.label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/55">
              {detail ?? copy.detail}
              {runnerCount !== null
                ? ` · ${runnerCount} container${runnerCount === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            currentStatus === "sleeping" ? void wake() : void refresh()
          }
          disabled={loading || waking}
          className="rounded-lg border border-orange-500/35 px-3 py-2 text-xs font-bold text-orange-200 transition hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}
