import type { PiroInput } from "./contracts";

type ModalInferenceResponse = {
  text?: unknown;
  error?: unknown;
  durationMs?: unknown;
  state?: unknown;
};

export type ModalInferenceResult = {
  text: string;
  durationMs: number;
  state: Record<string, unknown> | null;
};

export async function invokeModalInference(
  endpoint: string,
  modelId: string,
  architecture: "ashfall" | "borealis",
  input: PiroInput,
  secret: string,
  state: Record<string, unknown> | null = null,
  fetchImpl: typeof fetch = fetch,
): Promise<ModalInferenceResult> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: modelId,
      architecture,
      parts: input.parts,
      state,
      secret,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as ModalInferenceResponse | null;
  if (!response.ok) {
    const detail =
      typeof payload?.error === "string"
        ? payload.error
        : "Modal inference failed";
    throw new ModalInferenceError(detail, response.status);
  }

  if (typeof payload?.error === "string") {
    throw new ModalInferenceError(payload.error, 500);
  }

  return {
    text: typeof payload?.text === "string" ? payload.text : "",
    durationMs:
      typeof payload?.durationMs === "number" ? payload.durationMs : 0,
    state:
      payload?.state !== null && typeof payload?.state === "object"
        ? (payload.state as Record<string, unknown>)
        : null,
  };
}

export class ModalInferenceError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus: number,
  ) {
    super(message);
    this.name = "ModalInferenceError";
  }
}
