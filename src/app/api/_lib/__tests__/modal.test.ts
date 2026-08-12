import { describe, expect, test } from "bun:test";
import { invokeModalInference } from "../modal";

describe("invokeModalInference telemetry", () => {
  test("preserves durationMs and propagates the request ID", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        text: "value_013",
        durationMs: 977,
        state: { step: 1 },
        metadata: { outputFormat: "token-id" },
        timings: {
          requestId: "request-from-modal",
          modalEndpointMs: 1200,
          modalQueueMs: 200,
          workerMs: 977,
          modelLoadMs: 700,
          modelInvokeMs: 277,
          cacheHit: false,
        },
      });
    };

    const result = await invokeModalInference(
      "https://example.modal.run",
      "model-id",
      "ashfall",
      { parts: [{ type: "text", text: "hello" }] },
      "secret",
      null,
      fetchImpl,
      "request-from-vercel",
    );

    expect(requestBody?.request_id).toBe("request-from-vercel");
    expect(result.durationMs).toBe(977);
    expect(result.timings?.requestId).toBe("request-from-vercel");
    expect(result.timings?.modalEndpointMs).toBe(1200);
    expect(result.timings?.modelInvokeMs).toBe(277);
  });

  test("ignores malformed timing values while preserving the response", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json({
        text: "ok",
        durationMs: 12,
        timings: {
          requestId: "request-id",
          modelLoadMs: "slow",
          cacheHit: "unknown",
        },
      });

    const result = await invokeModalInference(
      "https://example.modal.run",
      "model-id",
      "ashfall",
      { parts: [{ type: "text", text: "hello" }] },
      "secret",
      null,
      fetchImpl,
      "request-id",
    );

    expect(result.durationMs).toBe(12);
    expect(result.timings?.requestId).toBe("request-id");
    expect(result.timings?.modelLoadMs).toBeUndefined();
    expect(result.timings?.cacheHit).toBeUndefined();
  });
});
