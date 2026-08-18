import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../data/db";
import { trainingRunEvent as trainingRunEventRow } from "../../data/schema";
import {
  canonicalTrainingRunEventName,
  deriveTrainingRunHistory,
  paginateTrainingRunHistory,
  TRAINING_RUN_HISTORY_PAGE_SIZE,
  type TrainingRunHistoryEvent,
  type TrainingRunHistoryPage,
  type TrainingRunHistorySource,
  type TrainingRunEventPayload,
} from "./training-run-events";

function observedAtFor(event: TrainingRunEventPayload): Date {
  const value = event.observedAt;
  if (typeof value === "string" || value instanceof Date) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function stepFor(event: TrainingRunEventPayload): number | null {
  const value = event.step ?? event.checkpointStep;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** Insert one canonical lifecycle event; non-timeline events remain logs. */
export async function insertTrainingRunEvent(
  trainingRunId: string,
  event: TrainingRunEventPayload,
): Promise<void> {
  const rawEvent = String(event.event ?? "unknown");
  const timelineEvent = canonicalTrainingRunEventName(rawEvent);
  if (!timelineEvent) return;

  const details =
    rawEvent === timelineEvent ? event : { ...event, sourceEvent: rawEvent };
  await db.insert(trainingRunEventRow).values({
    id: crypto.randomUUID(),
    trainingRunId,
    event: timelineEvent,
    observedAt: observedAtFor(event),
    step: stepFor(event),
    detailsJson: JSON.stringify(details),
  });
}

function parseDetails(value: string): TrainingRunEventPayload {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as TrainingRunEventPayload)
      : {};
  } catch {
    return {};
  }
}

function eventStepForRow(
  row: typeof trainingRunEventRow.$inferSelect,
): number | undefined {
  if (row.step !== null) return row.step;
  const details = parseDetails(row.detailsJson);
  const step = stepFor(details);
  return step === null ? undefined : step;
}

function historyFromRows(
  rows: Array<typeof trainingRunEventRow.$inferSelect>,
  source: TrainingRunHistorySource = {},
): TrainingRunHistoryEvent[] {
  const rawEvents = rows.map((row) => {
    const details = parseDetails(row.detailsJson);
    return {
      ...details,
      event: String(details.event ?? row.event),
      step: eventStepForRow(row),
      observedAt: details.observedAt ?? row.observedAt.toISOString(),
    };
  });
  return deriveTrainingRunHistory(JSON.stringify(rawEvents), source);
}

/** Read canonical lifecycle events from relational rows, including historical raw rows. */
export async function getRecentTrainingRunEvents(
  trainingRunId: string,
  limit = 64,
): Promise<TrainingRunHistoryEvent[]> {
  const rows = await db
    .select()
    .from(trainingRunEventRow)
    .where(eq(trainingRunEventRow.trainingRunId, trainingRunId))
    .orderBy(desc(trainingRunEventRow.observedAt), desc(trainingRunEventRow.id))
    .limit(Math.max(1, Math.floor(limit)));
  return rows.reverse().map((row) => ({
    id: row.id,
    event: row.event,
    observedAt: row.observedAt.toISOString(),
    ...(row.step === null ? {} : { step: row.step }),
    details: parseDetails(row.detailsJson),
  }));
}

/** Read the six canonical lifecycle events, falling back to legacy history for old runs. */
export async function getTrainingRunEventPage(
  trainingRunId: string,
  offset = 0,
  source: TrainingRunHistorySource = {},
  legacyEventLogJson?: string | null,
): Promise<TrainingRunHistoryPage> {
  const safeOffset = Math.max(0, Math.floor(offset));
  const rows = await db
    .select()
    .from(trainingRunEventRow)
    .where(eq(trainingRunEventRow.trainingRunId, trainingRunId))
    .orderBy(asc(trainingRunEventRow.observedAt), asc(trainingRunEventRow.id));

  if (rows.length > 0) {
    return paginateTrainingRunHistory(
      historyFromRows(rows, source),
      safeOffset,
      TRAINING_RUN_HISTORY_PAGE_SIZE,
    );
  }

  return paginateTrainingRunHistory(
    deriveTrainingRunHistory(legacyEventLogJson, source),
    safeOffset,
    TRAINING_RUN_HISTORY_PAGE_SIZE,
  );
}
