import { describe, expect, test } from "bun:test";
import {
  appendTrainingRunEventJson,
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
});
