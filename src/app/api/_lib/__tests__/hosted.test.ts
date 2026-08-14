import { describe, expect, test } from "bun:test";
import { checkHostedReadiness } from "../hosted";

describe("hosted readiness", () => {
  const config = {
    endpoint: "https://example.modal.direct/v1",
    apiModelName: "google/gemma-3-270m-it",
  };

  test("maps an upstream 503 to warming_up", async () => {
    const result = await checkHostedReadiness(
      config,
      async () => new Response(null, { status: 503 }),
    );

    expect(result).toEqual({ status: "warming_up", retryAfterMs: 5_000 });
  });

  test("maps a healthy models response to ready", async () => {
    const result = await checkHostedReadiness(config, async () =>
      Response.json({ object: "list", data: [] }),
    );

    expect(result).toEqual({ status: "ready" });
  });
});
