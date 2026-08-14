import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const inferRouteSource = readFileSync(
  fileURLToPath(new URL("../../models/[id]/infer/route.ts", import.meta.url)),
  "utf8",
);
const sandboxSource = readFileSync(
  fileURLToPath(
    new URL("../../../(app)/models/ModelSandbox.tsx", import.meta.url),
  ),
  "utf8",
);

describe("hosted cold-start polling contract", () => {
  test("returns a successful warming-up response for an upstream 503", () => {
    expect(inferRouteSource).toContain('status: "warming_up"');
    expect(inferRouteSource).toContain('headers: { "Retry-After": "5" }');
    expect(inferRouteSource).toContain("error.upstreamStatus === 503");
  });

  test("polls readiness long enough for the Gemma cold start", () => {
    expect(sandboxSource).toContain("/ready");
    expect(sandboxSource).toContain('readinessBody?.status === "ready"');
    expect(sandboxSource).toContain("body = await infer();");
    expect(sandboxSource).toContain("const HOSTED_WARMUP_TIMEOUT_MS = 300_000;");
  });

  test("shows distinct connection, warmup, and thinking phases", () => {
    expect(sandboxSource).toContain('pendingPhase?: "connecting" | "warming_up" | "thinking"');
    expect(sandboxSource).toContain('pendingPhase: "connecting"');
    expect(sandboxSource).toContain('updateAssistant({ pendingPhase: "warming_up" })');
    expect(sandboxSource).toContain('updateAssistant({ pendingPhase: "thinking" })');
    expect(sandboxSource).toContain("Waking up Gemma…");
    expect(sandboxSource).toContain("Connecting…");
    expect(sandboxSource).toContain("Thinking…");
  });

  test("preserves actionable client-side inference errors", () => {
    expect(sandboxSource).toContain("error instanceof Error && error.message");
    expect(sandboxSource).toContain(
      '"We could not reach the inference service. Please try again."',
    );
  });
});
