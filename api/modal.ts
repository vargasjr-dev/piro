import type { PiroInput } from "./contracts";
import { piroInputToModalInput } from "./contracts";

type ModalInferenceResponse = {
  text?: unknown;
  error?: unknown;
  durationMs?: unknown;
};

export type ModalInferenceResult = {
  text: string;
  durationMs: number;
};

export async function invokeModalInference(
  endpoint: string,
  modelId: string,
  input: PiroInput,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModalInferenceResult> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: modelId,
      input: piroInputToModalInput(input),
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
