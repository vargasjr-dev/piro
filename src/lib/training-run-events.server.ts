import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../data/db";
import { trainingRunEvent as trainingRunEventRow } from "../../data/schema";
import {
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

/** Insert one durable event row. The legacy JSON column is intentionally not touched. */
export async function insertTrainingRunEvent(
  trainingRunId: string,
  event: TrainingRunEventPayload,
): Promise<void> {
  await db.insert(trainingRunEventRow).values({
    id: crypto.randomUUID(),
    trainingRunId,
    event: String(event.event ?? "unknown"),
    observedAt: observedAtFor(event),
    step: stepFor(event),
    detailsJson: JSON.stringify(event),
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

function eventFromRow(
  row: typeof trainingRunEventRow.$inferSelect,
): TrainingRunHistoryEvent {
  return {
    id: row.id,
    event: row.event,
    observedAt: row.observedAt.toISOString(),
    ...(row.step === null ? {} : { step: row.step }),
    details: parseDetails(row.detailsJson),
  };
}

function pageFromRows(
  rows: Array<typeof trainingRunEventRow.$inferSelect>,
  offset: number,
  limit: number,
): TrainingRunHistoryPage {
  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const events = visible.map(eventFromRow);
  return {
    events,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + visible.length : null,
  };
}

function pageFromLegacyJson(
  value: string | null | undefined,
  offset: number,
  limit: number,
): TrainingRunHistoryPage {
  const events = deriveTrainingRunHistory(value).map((event, index) => ({
    ...event,
    id: `legacy-${offset + index}`,
  }));
  const rawEvents = value
    ? (() => {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
    : [];
  const rawHistory: TrainingRunHistoryEvent[] = rawEvents
    .filter(
      (entry): entry is TrainingRunEventPayload =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    )
    .map((entry, index) => ({
      id: `legacy-${index}`,
      event: String(entry.event ?? "unknown"),
      observedAt:
        typeof entry.observedAt === "string" ? entry.observedAt : null,
      ...(stepForLegacyEvent(entry) === undefined
        ? {}
        : { step: stepForLegacyEvent(entry) }),
      details: entry,
    }))
    .reverse();
  const pageEvents = rawHistory.slice(offset, offset + limit);
  const hasMore = offset + pageEvents.length < rawHistory.length;
  return {
    events:
      rawHistory.length > 0 ? pageEvents : events.slice(offset, offset + limit),
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + pageEvents.length : null,
  };
}

function stepForLegacyEvent(
  event: TrainingRunEventPayload,
): number | undefined {
  const value = event.step ?? event.checkpointStep;
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

/** Return recent raw relational events in chronological order. */
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
  return rows.reverse().map(eventFromRow);
}

/** Read raw relational events, falling back to the legacy bounded log for old runs. */
export async function getTrainingRunEventPage(
  trainingRunId: string,
  offset = 0,
  source?: TrainingRunHistorySource,
  legacyEventLogJson?: string | null,
): Promise<TrainingRunHistoryPage> {
  const safeOffset = Math.max(0, Math.floor(offset));
  const limit = TRAINING_RUN_HISTORY_PAGE_SIZE;
  const rows = await db
    .select()
    .from(trainingRunEventRow)
    .where(eq(trainingRunEventRow.trainingRunId, trainingRunId))
    .orderBy(desc(trainingRunEventRow.observedAt), desc(trainingRunEventRow.id))
    .limit(limit + 1)
    .offset(safeOffset);

  if (rows.length > 0) {
    return pageFromRows(rows, safeOffset, limit);
  }

  if (legacyEventLogJson) {
    return pageFromLegacyJson(legacyEventLogJson, safeOffset, limit);
  }

  return paginateTrainingRunHistory(
    deriveTrainingRunHistory(legacyEventLogJson, source),
    safeOffset,
    limit,
  );
}
