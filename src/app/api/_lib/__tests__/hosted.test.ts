import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  checkHostedReadiness,
  getHostedDeploymentStatus,
  wakeHostedDeployment,
} from "../hosted";

describe("hosted readiness", () => {
  const originalControlSecret = process.env.TEST_CONTROL_SECRET;
  beforeAll(() => {
    process.env.TEST_CONTROL_SECRET = "test-secret";
  });
  afterAll(() => {
    if (originalControlSecret === undefined)
      delete process.env.TEST_CONTROL_SECRET;
    else process.env.TEST_CONTROL_SECRET = originalControlSecret;
  });

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

  test("uses the control plane for sleeping status", async () => {
    const result = await getHostedDeploymentStatus(
      {
        ...config,
        controlEndpoint: "https://control.example",
        controlSecretEnvVar: "TEST_CONTROL_SECRET",
      },
      async (_input, init) => {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          action: "status",
          secret: "test-secret",
        });
        return Response.json({ status: "sleeping", runnerCount: 0 });
      },
    );

    expect(result).toEqual({ status: "sleeping", runnerCount: 0 });
  });

  test("uses the control plane to wake a starting deployment", async () => {
    const result = await wakeHostedDeployment(
      {
        ...config,
        controlEndpoint: "https://control.example",
        controlSecretEnvVar: "TEST_CONTROL_SECRET",
      },
      async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          action: "wake",
          secret: "test-secret",
        });
        return Response.json({
          status: "starting",
          runnerCount: 1,
          retryAfterMs: 5_000,
        });
      },
    );

    expect(result.status).toBe("starting");
    expect(result.retryAfterMs).toBe(5_000);
  });
});
