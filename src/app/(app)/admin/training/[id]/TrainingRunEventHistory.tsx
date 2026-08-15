"use client";

import { useState } from "react";
import type {
  TrainingRunHistoryEvent,
  TrainingRunHistoryPage,
} from "~/lib/training-run-events";

const EVENT_STYLES: Record<TrainingRunHistoryEvent["event"], string> = {
  queued: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  started: "border-orange-400/35 bg-orange-400/10 text-orange-200",
  checkpointed: "border-sky-400/35 bg-sky-400/10 text-sky-200",
  failed: "border-red-400/35 bg-red-400/10 text-red-200",
  succeeded: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
  resumed: "border-violet-400/35 bg-violet-400/10 text-violet-200",
};

function formatEventDate(value: string | null): string {
  if (!value) return "Time unavailable";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function TrainingRunEventHistory({
  runId,
  initialPage,
}: {
  runId: string;
  initialPage: TrainingRunHistoryPage;
}) {
  const [events, setEvents] = useState(initialPage.events);
  const [nextOffset, setNextOffset] = useState(initialPage.nextOffset);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (loading || !hasMore || nextOffset === null) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/training-runs/${runId}/events?offset=${nextOffset}`,
      );
      if (!response.ok) throw new Error("Unable to load more events.");
      const page = (await response.json()) as TrainingRunHistoryPage;
      setEvents((current) => [...current, ...page.events]);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load more events.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-900/30 bg-[#100c0a] p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-amber-50">Event history</h2>
          <p className="mt-1 text-sm text-amber-200/50">
            The newest milestones recorded for this training run.
          </p>
        </div>
        <span className="text-xs text-amber-300/45">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="mt-5 text-sm text-amber-200/50">
          No events recorded yet.
        </p>
      ) : (
        <ol className="mt-5 space-y-4">
          {events.map((entry, index) => (
            <li
              key={`${entry.event}-${entry.observedAt ?? "unknown"}-${entry.step ?? index}`}
              className="relative pl-8"
            >
              {index < events.length - 1 ? (
                <span className="absolute left-[0.43rem] top-6 h-[calc(100%+1rem)] w-px bg-amber-900/50" />
              ) : null}
              <span
                className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border ${EVENT_STYLES[entry.event]}`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${EVENT_STYLES[entry.event]}`}
                >
                  {entry.event}
                </span>
                {entry.step !== undefined ? (
                  <span className="text-xs text-amber-200/50">
                    Step {entry.step}
                  </span>
                ) : null}
                <time
                  className="text-xs text-amber-200/40"
                  dateTime={entry.observedAt ?? undefined}
                >
                  {formatEventDate(entry.observedAt)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
      {error ? <p className="mt-5 text-sm text-red-300">{error}</p> : null}
      {hasMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-6 rounded-lg border border-orange-400/40 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:border-orange-300 hover:text-amber-50 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Loading…" : "See more"}
        </button>
      ) : null}
    </section>
  );
}
