import { sql, type SQL } from "drizzle-orm";
import { trainingRun } from "../../data/schema";

const MAX_TRAINING_RUN_EVENTS = 64;

type TrainingRunEvent = Record<string, unknown>;

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

export function appendTrainingRunEventSql(event: TrainingRunEvent): SQL {
  const current = sql`COALESCE(NULLIF(${trainingRun.workerEventLogJson}, ''), '[]')::jsonb`;
  const array = sql`CASE
    WHEN jsonb_typeof(${current}) = 'array' THEN ${current}
    ELSE '[]'::jsonb
  END || ${JSON.stringify([event])}::jsonb`;
  return sql`(
    SELECT COALESCE(jsonb_agg(item.value ORDER BY item.ordinality), '[]'::jsonb)::text
    FROM jsonb_array_elements(${array}) WITH ORDINALITY AS item(value, ordinality)
    WHERE item.ordinality > GREATEST(jsonb_array_length(${array}) - ${MAX_TRAINING_RUN_EVENTS}, 0)
  )`;
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

/** Return the durable event history in the shape exposed by training APIs. */
export function exposeTrainingRunEvents(value: string | null | undefined) {
  const workerEvents = parseTrainingRunEvents(value);
  return {
    workerEvents,
    lastWorkerEvent: workerEvents.at(-1) ?? null,
  };
}
