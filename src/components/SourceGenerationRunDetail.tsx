"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Run = {
  id: string;
  sourceName: string;
  sourcePath: string;
  status: string;
  costUsd: number | null;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dataset: {
    id: string;
    name: string;
    sampleCount: number | null;
    generatedAt: string | null;
  } | null;
};

function statusClass(status: string) {
  if (status === "complete") return "text-emerald-300";
  if (status === "error") return "text-red-300";
  if (status === "running") return "text-orange-300";
  return "text-amber-300";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SourceGenerationRunDetail({
  initialRun,
  streamEndpoint,
  datasetHref,
  sourceHref,
}: {
  initialRun: Run;
  streamEndpoint: string;
  datasetHref: string | null;
  sourceHref: string;
}) {
  const [run, setRun] = useState(initialRun);

  useEffect(() => {
    if (run.status === "complete" || run.status === "error") return;

    const events = new EventSource(streamEndpoint);
    events.addEventListener("state", (event) => {
      setRun(JSON.parse(event.data) as Run);
    });
    events.addEventListener("error", () => events.close());
    return () => events.close();
  }, [run.status, streamEndpoint]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={sourceHref}
          className="text-xs text-amber-400/50 transition-colors hover:text-amber-200"
        >
          ← Back to source
        </Link>
        <span className={`text-xs font-medium ${statusClass(run.status)}`}>
          {run.status}
        </span>
      </div>

      <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 p-4">
        <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
          Generation run
        </p>
        <p className="mt-2 break-all font-mono text-xs text-amber-300/60">
          {run.id}
        </p>
        <p className="mt-2 text-sm text-amber-200/75">{run.sourcePath}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 p-4">
          <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
            Cost
          </p>
          <p className="mt-2 text-lg text-amber-100">
            {run.costUsd === null ? "Pending" : `$${run.costUsd.toFixed(4)}`}
          </p>
        </div>
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 p-4">
          <p className="text-[10px] uppercase tracking-widest text-amber-600/45">
            Samples
          </p>
          <p className="mt-2 text-lg text-amber-100">
            {run.dataset?.sampleCount?.toLocaleString() ?? "Pending"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 p-4 space-y-3">
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-amber-700/45">Queued</span>
          <span className="text-amber-300/65">{formatDate(run.queuedAt)}</span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-amber-700/45">Started</span>
          <span className="text-amber-300/65">{formatDate(run.startedAt)}</span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-amber-700/45">Completed</span>
          <span className="text-amber-300/65">
            {formatDate(run.completedAt)}
          </span>
        </div>
      </div>

      {run.error && (
        <div className="rounded-xl border border-red-900/20 bg-red-950/20 p-4 text-xs text-red-300/75">
          {run.error}
        </div>
      )}

      {datasetHref && run.status === "complete" && (
        <Link
          href={datasetHref}
          className="inline-flex rounded-lg bg-orange-500/15 px-3 py-2 text-xs font-medium text-orange-300 transition-colors hover:bg-orange-500/25"
        >
          Open generated dataset →
        </Link>
      )}
    </div>
  );
}
