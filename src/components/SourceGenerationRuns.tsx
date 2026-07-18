import Link from "next/link";
import type { SourceGenerationRun } from "~/lib/source-generation-runs.server";
import { SOURCE_GENERATION_RUN_PAGE_SIZE } from "~/lib/source-generation-runs";

function statusClass(status: string) {
  if (status === "complete") return "text-emerald-400/70";
  if (status === "error") return "text-red-400/70";
  if (status === "running") return "text-orange-400/70";
  return "text-amber-500/60";
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SourceGenerationRuns({
  runs,
  page,
  pageCount,
  username,
  slug,
  source,
}: {
  runs: SourceGenerationRun[];
  page: number;
  pageCount: number;
  username: string;
  slug: string;
  source: string;
}) {
  const sourceHref = `/repos/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/sources/${encodeURIComponent(source)}`;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-amber-100">
            Generation runs
          </h3>
          <p className="text-xs text-amber-400/40 mt-0.5">
            The latest {SOURCE_GENERATION_RUN_PAGE_SIZE} runs for this source.
          </p>
        </div>
        {pageCount > 1 && (
          <p className="text-[11px] text-amber-700/40">
            Page {page} of {pageCount}
          </p>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-7 text-center">
          <p className="text-sm text-amber-400/50">No generation runs yet.</p>
          <p className="text-xs text-amber-600/30 mt-1">
            Click Generate dataset above to create the first run.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-amber-900/15 bg-amber-900/5">
          <div className="divide-y divide-amber-900/15">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`${sourceHref}/runs/${encodeURIComponent(run.id)}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-amber-900/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-amber-200/80">
                    {formatDate(run.queuedAt)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-mono text-amber-700/35">
                    {run.id}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-xs text-amber-300/55">
                    {run.costUsd === null ? "—" : `$${run.costUsd.toFixed(4)}`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-amber-700/35">
                    {run.dataset?.sampleCount
                      ? `${run.dataset.sampleCount.toLocaleString()} samples`
                      : "No samples yet"}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-medium ${statusClass(run.status)}`}
                >
                  {run.status}
                </span>
                <svg
                  className="h-4 w-4 shrink-0 text-amber-800/35"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m9 18 6-6-6-6"
                  />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`${sourceHref}?runsPage=${page - 1}`}
              className="text-xs text-amber-400/55 hover:text-amber-200"
            >
              ← Newer runs
            </Link>
          ) : (
            <span />
          )}
          {page < pageCount ? (
            <Link
              href={`${sourceHref}?runsPage=${page + 1}`}
              className="text-xs text-amber-400/55 hover:text-amber-200"
            >
              Older runs →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </section>
  );
}
