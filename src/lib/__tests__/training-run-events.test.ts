import { describe, expect, test } from "bun:test";
import {
  appendTrainingRunEventJson,
  deriveTrainingRunHistory,
  exposeTrainingRunEvents,
  parseTrainingRunEvents,
  trainingRunEvent,
} from "../training-run-events";

describe("training-run-events", () => {
  test("appends events and keeps only the bounded tail", () => {
    let value: string | null = null;
    for (let index = 0; index < 70; index += 1) {
      value = appendTrainingRunEventJson(value, { event: `event-${index}` });
    }

    const events = JSON.parse(value ?? "[]") as Array<{ event: string }>;
    expect(events).toHaveLength(64);
    expect(events[0]?.event).toBe("event-6");
    expect(events.at(-1)?.event).toBe("event-69");
  });

  test("recovers from malformed history", () => {
    expect(parseTrainingRunEvents("not-json")).toEqual([
      { event: "invalid_event_log", raw: "not-json" },
    ]);
    expect(
      JSON.parse(appendTrainingRunEventJson("not-json", { event: "new" })),
    ).toEqual([{ event: "new" }]);
  });

  test("adds a timestamp without including sensitive request data", () => {
    const event = trainingRunEvent("dispatch_failed", { status: 503 });
    expect(event.event).toBe("dispatch_failed");
    expect(event.status).toBe(503);
    expect(typeof event.observedAt).toBe("string");
  });

  test("exposes the full history and its latest event", () => {
    const exposure = exposeTrainingRunEvents(
      JSON.stringify([
        { event: "worker_method_entered" },
        { event: "training_completed" },
      ]),
    );
    expect(exposure.workerEvents).toHaveLength(2);
    expect(exposure.workerEvents[0]?.event).toBe("worker_method_entered");
    expect(exposure.lastWorkerEvent?.event).toBe("training_completed");
  });

  test("derives only the supported user-facing lifecycle events", () => {
    const history = deriveTrainingRunHistory(
      JSON.stringify([
        { event: "run_claimed", observedAt: "2026-08-15T10:01:00.000Z" },
        { event: "checkpoint_saved", observedAt: "2026-08-15T10:02:00.000Z", checkpointStep: 0 },
        { event: "checkpoint_stage_completed", observedAt: "2026-08-15T10:03:00.000Z", step: 10 },
        { event: "resume_requested", observedAt: "2026-08-15T10:04:00.000Z" },
        { event: "complete", observedAt: "2026-08-15T10:05:00.000Z", step: 10 },
        { event: "unrelated_internal_event", observedAt: "2026-08-15T10:06:00.000Z" },
      ]),
      {
        queuedAt: "2026-08-15T10:00:00.000Z",
        status: "complete",
      },
    );

    expect(history.map((entry) => entry.event)).toEqual([
      "queued",
      "started",
      "checkpointed",
      "resumed",
      "succeeded",
    ]);
    expect(history.map((entry) => entry.step)).toEqual([
      undefined,
      undefined,
      0,
      undefined,
      10,
    ]);
  });

  test("adds terminal failure and checkpoint metadata when raw events are incomplete", () => {
    const history = deriveTrainingRunHistory("[]", {
      queuedAt: new Date("2026-08-15T10:00:00.000Z"),
      startedAt: new Date("2026-08-15T10:01:00.000Z"),
      checkpointAt: new Date("2026-08-15T10:02:00.000Z"),
      checkpointStep: 37,
      completedAt: new Date("2026-08-15T10:03:00.000Z"),
      status: "error",
    });

    expect(history.map((entry) => entry.event)).toEqual([
      "queued",
      "started",
      "checkpointed",
      "failed",
    ]);
  });
});
