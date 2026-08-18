const MAX_TRAINING_RUN_EVENTS = 64;

type TrainingRunEvent = Record<string, unknown>;
export type TrainingRunEventPayload = TrainingRunEvent;

export const TRAINING_RUN_EVENT_NAMES = [
  "queued",
  "started",
  "checkpointed",
  "failed",
  "succeeded",
  "resumed",
] as const;

/** Only these six canonical names belong in the user-facing timeline. */
export const TRAINING_RUN_TIMELINE_EVENT_NAMES = new Set<string>(
  TRAINING_RUN_EVENT_NAMES,
);

export function isTrainingRunTimelineEvent(event: string): boolean {
  return TRAINING_RUN_TIMELINE_EVENT_NAMES.has(event);
}

export function canonicalTrainingRunEventName(
  event: string,
): TrainingRunEventName | null {
  if (TRAINING_RUN_TIMELINE_EVENT_NAMES.has(event)) {
    return event as TrainingRunEventName;
  }
  if (event === "run_created") return "queued";
  if (event === "run_claimed") return "started";
  if (event === "checkpoint_saved") return "checkpointed";
  if (event === "resume_requested") return "resumed";
  if (event === "complete") return "succeeded";
  if (event.endsWith("_failed")) return "failed";
  return null;
}

export function isTrainingRunHistorySourceEvent(event: string): boolean {
  return canonicalTrainingRunEventName(event) !== null;
}

export type TrainingRunEventName = (typeof TRAINING_RUN_EVENT_NAMES)[number];

export interface TrainingRunHistoryEvent {
  id?: string;
  event: string;
  observedAt: string | null;
  step?: number;
  details?: TrainingRunEventPayload;
}

export interface TrainingRunHistorySource {
  status?: string | null;
  queuedAt?: Date | string | null;
  startedAt?: Date | string | null;
  checkpointAt?: Date | string | null;
  checkpointStep?: number | null;
  completedAt?: Date | string | null;
}

export const TRAINING_RUN_HISTORY_PAGE_SIZE = 25;

export interface TrainingRunHistoryPage {
  events: TrainingRunHistoryEvent[];
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

function eventTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function eventStep(raw: TrainingRunEvent): number | undefined {
  const value = raw.step ?? raw.checkpointStep;
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function eventSortTimestamp(event: TrainingRunHistoryEvent): number {
  return event.observedAt
    ? Date.parse(event.observedAt)
    : Number.MAX_SAFE_INTEGER;
}

export function appendTrainingRunEventJson(
  value: string | null | undefined,
  event: TrainingRunEvent,
): string {
  let events: TrainingRunEvent[] = [];
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        events = parsed.filter(
          (entry): entry is TrainingRunEvent =>
            Boolean(entry) &&
            typeof entry === "object" &&
            !Array.isArray(entry),
        );
      }
    } catch {
      events = [];
    }
  }
  events.push(event);
  return JSON.stringify(events.slice(-MAX_TRAINING_RUN_EVENTS));
}

export function trainingRunEvent(
  event: string,
  details: TrainingRunEvent = {},
): TrainingRunEvent {
  return {
    event,
    observedAt: new Date().toISOString(),
    ...details,
  };
}

export function parseTrainingRunEvents(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [{ event: "invalid_event_log", raw: value }];
  }
}

/** Derive the small, stable lifecycle vocabulary shown to training users. */
export function deriveTrainingRunHistory(
  value: string | null | undefined,
  source: TrainingRunHistorySource = {},
): TrainingRunHistoryEvent[] {
  const history: TrainingRunHistoryEvent[] = [];
  const add = (
    event: TrainingRunEventName,
    observedAt: unknown,
    step?: number,
  ) => {
    const normalizedAt = eventTimestamp(observedAt);
    const duplicate = history.some((entry) => {
      if (entry.event !== event) return false;
      if (event === "checkpointed") return entry.step === step;
      if (event === "resumed") return entry.observedAt === normalizedAt;
      return true;
    });
    if (duplicate) return;
    history.push({
      event,
      observedAt: normalizedAt,
      ...(step === undefined ? {} : { step }),
    });
  };

  add("queued", source.queuedAt);

  for (const raw of parseTrainingRunEvents(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as TrainingRunEvent;
    const event = String(record.event ?? "");
    const observedAt = record.observedAt;
    const step = eventStep(record);
    const canonicalEvent = canonicalTrainingRunEventName(event);

    if (canonicalEvent) add(canonicalEvent, observedAt, step);
  }

  if (source.startedAt && !history.some((entry) => entry.event === "started")) {
    add("started", source.startedAt);
  }
  if (
    source.checkpointAt &&
    !history.some(
      (entry) =>
        entry.event === "checkpointed" &&
        entry.step === (source.checkpointStep ?? undefined),
    )
  ) {
    add(
      "checkpointed",
      source.checkpointAt,
      source.checkpointStep ?? undefined,
    );
  }
  if (
    source.status === "complete" &&
    !history.some((entry) => entry.event === "succeeded")
  ) {
    add("succeeded", source.completedAt);
  }
  if (
    source.status === "error" &&
    !history.some((entry) => entry.event === "failed")
  ) {
    add("failed", source.completedAt);
  }

  return history.sort((a, b) => eventSortTimestamp(a) - eventSortTimestamp(b));
}

export function paginateTrainingRunHistory(
  events: TrainingRunHistoryEvent[],
  offset = 0,
  limit = TRAINING_RUN_HISTORY_PAGE_SIZE,
): TrainingRunHistoryPage {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.min(
    TRAINING_RUN_HISTORY_PAGE_SIZE,
    Math.max(1, Math.floor(limit)),
  );
  const newestFirst = [...events].reverse();
  const pageEvents = newestFirst.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + pageEvents.length;
  const hasMore = nextOffset < newestFirst.length;
  return {
    events: pageEvents,
    offset: safeOffset,
    limit: safeLimit,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
  };
}

/** Return the durable and user-facing histories exposed by training APIs. */
export function exposeTrainingRunEvents(
  value: string | null | undefined,
  source: TrainingRunHistorySource = {},
) {
  const workerEvents = parseTrainingRunEvents(value);
  return {
    workerEvents,
    lastWorkerEvent: workerEvents.at(-1) ?? null,
    eventHistory: deriveTrainingRunHistory(value, source),
  };
}
