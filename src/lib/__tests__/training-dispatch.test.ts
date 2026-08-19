import { describe, expect, test } from "bun:test";
import {
  ModalDispatchError,
  parseModalDispatchResponse,
} from "../training-dispatch.server";

describe("parseModalDispatchResponse", () => {
  test("returns a trimmed function-call ID from a successful response", async () => {
    await expect(
      parseModalDispatchResponse(
        new Response(JSON.stringify({ functionCallId: "  fc-123  " }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).resolves.toEqual({ functionCallId: "fc-123" });
  });

  test("rejects non-success responses", async () => {
    await expect(
      parseModalDispatchResponse(new Response("busy", { status: 503 })),
    ).rejects.toEqual(
      new ModalDispatchError("Modal trigger returned HTTP 503."),
    );
  });

  test("rejects malformed or untraceable acknowledgements", async () => {
    await expect(
      parseModalDispatchResponse(new Response("not-json", { status: 200 })),
    ).rejects.toEqual(
      new ModalDispatchError("Modal trigger returned invalid JSON."),
    );
    await expect(
      parseModalDispatchResponse(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    ).rejects.toEqual(
      new ModalDispatchError(
        "Modal trigger response did not include a valid functionCallId.",
      ),
    );
  });
});
