import type { trainingRun } from "../../data/schema";

type TrainingRun = typeof trainingRun.$inferSelect;

export function isTrainingRunCancellable(
  run: Pick<TrainingRun, "status">,
): boolean {
  return run.status === "queued" || run.status === "running";
}

export function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function formatAge(value: Date | null, now = new Date()): string {
  if (!value) return "—";
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - value.getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDate(value: Date | null): string {
  return value
    ? value.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "short",
      })
    : "—";
}

export function formatArchitecturePath(value: string | null): string {
  if (!value) return "—";
  return value.match(/(?:^|\/)architectures\/([^/]+)\/main\.py$/)?.[1] ?? value;
}

export function formatSourcePath(value: string | null): string {
  if (!value) return "—";
  const sourcesIndex = value.indexOf("/sources/");
  return sourcesIndex >= 0 ? value.slice(sourcesIndex + 1) : value;
}
