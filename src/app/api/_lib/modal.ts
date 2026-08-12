import type { PiroInput } from "./contracts";
import type { InferenceTimings } from "./timings";

type ModalInferenceResponse = {
  text?: unknown;
  error?: unknown;
  durationMs?: unknown;
  state?: unknown;
  metadata?: unknown;
  timings?: unknown;
};

export type ModalInferenceResult = {
  text: string;
  durationMs: number;
  state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  timings: InferenceTimings | null;
};

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const timingNumberKeys = [
  "routeMs",
  "authMs",
  "modelLookupMs",
  "inputValidationMs",
  "modalHttpMs",
  "modalEndpointMs",
  "modalQueueMs",
  "workerMs",
  "modelLoadMs",
  "modelInvokeMs",
  "containerSetupMs",
  "browserE2eMs",
] as const;

function timingsOrNull(value: unknown): InferenceTimings | null {
  const record = recordOrNull(value);
  if (!record) return null;

  const timings: InferenceTimings = {};
  if (typeof record.requestId === "string")
    timings.requestId = record.requestId;
  if (typeof record.cacheHit === "boolean") timings.cacheHit = record.cacheHit;
  for (const key of timingNumberKeys) {
    if (typeof record[key] === "number" && Number.isFinite(record[key])) {
      timings[key] = record[key];
    }
  }
  return timings;
}

export async function invokeModalInference(
  endpoint: string,
  modelId: string,
  architecture: string,
  input: PiroInput,
  secret: string,
  state: Record<string, unknown> | null = null,
  fetchImpl: typeof fetch = fetch,
  requestId: string = crypto.randomUUID(),
): Promise<ModalInferenceResult> {
  const modalStartedAt = performance.now();
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: modelId,
      architecture,
      parts: input.parts,
      state,
      secret,
      request_id: requestId,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const modalHttpMs = Math.max(
    0,
    Math.round(performance.now() - modalStartedAt),
  );

  const payload = (await response
    .json()
    .catch(() => null)) as ModalInferenceResponse | null;
  if (!response.ok) {
    const detail =
      typeof payload?.error === "string"
        ? payload.error
        : "Modal inference failed";
    throw new ModalInferenceError(detail, response.status, {
      requestId,
      modalHttpMs,
      timings: timingsOrNull(payload?.timings),
    });
  }

  if (typeof payload?.error === "string") {
    throw new ModalInferenceError(payload.error, 500, {
      requestId,
      modalHttpMs,
      timings: timingsOrNull(payload.timings),
    });
  }

  return {
    text: typeof payload?.text === "string" ? payload.text : "",
    durationMs:
      typeof payload?.durationMs === "number" ? payload.durationMs : 0,
    state: recordOrNull(payload?.state),
    metadata: recordOrNull(payload?.metadata),
    timings: {
      ...(timingsOrNull(payload?.timings) ?? {}),
      requestId,
      modalHttpMs,
    },
  };
}

export class ModalInferenceError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus: number,
    readonly performance?: {
      requestId: string;
      modalHttpMs: number;
      timings: InferenceTimings | null;
    },
  ) {
    super(message);
    this.name = "ModalInferenceError";
  }
}
