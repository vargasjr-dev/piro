import type { PiroInput } from "./contracts";

export type HostedInferenceConfig = {
  endpoint: string;
  apiModelName: string;
  apiKeyEnvVar?: string | null;
  controlEndpoint?: string;
  controlSecretEnvVar?: string;
};

export type HostedReadinessResult =
  | { status: "ready" }
  | { status: "warming_up"; retryAfterMs: number };

export type HostedDeploymentStatus = {
  status: "ready" | "sleeping" | "starting" | "unavailable";
  runnerCount?: number;
  retryAfterMs?: number;
  detail?: string;
};

type HostedChatResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

type HostedErrorResponse = {
  error?: unknown;
};

type HostedControlResponse = HostedDeploymentStatus & {
  error?: string;
};

export type HostedInferenceResult = {
  text: string;
  durationMs: number;
};

function hostedApiKey(config: HostedInferenceConfig): string | undefined {
  return config.apiKeyEnvVar ? process.env[config.apiKeyEnvVar] : undefined;
}

function hostedControlSecret(
  config: HostedInferenceConfig,
): string | undefined {
  return config.controlSecretEnvVar
    ? process.env[config.controlSecretEnvVar]
    : undefined;
}

async function callHostedControl(
  config: HostedInferenceConfig,
  action: "status" | "wake",
  fetchImpl: typeof fetch,
): Promise<HostedControlResponse> {
  if (!config.controlEndpoint || !config.controlSecretEnvVar) {
    throw new HostedInferenceError(
      "Hosted control plane is not configured",
      500,
    );
  }
  const secret = hostedControlSecret(config);
  if (!secret) {
    throw new HostedInferenceError(
      `${config.controlSecretEnvVar} is not configured`,
      500,
    );
  }

  const response = await fetchImpl(config.controlEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, secret }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response
    .json()
    .catch(() => null)) as HostedControlResponse | null;
  if (!response.ok || !payload || typeof payload.status !== "string") {
    throw new HostedInferenceError(
      payload?.error ??
        `Hosted control request failed with status ${response.status}`,
      response.status,
    );
  }
  return payload;
}

export async function getHostedDeploymentStatus(
  config: HostedInferenceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HostedDeploymentStatus> {
  if (config.controlEndpoint && config.controlSecretEnvVar) {
    return callHostedControl(config, "status", fetchImpl);
  }

  const readiness = await checkHostedReadiness(config, fetchImpl);
  return readiness.status === "ready"
    ? { status: "ready" }
    : { status: "starting", retryAfterMs: readiness.retryAfterMs };
}

export async function wakeHostedDeployment(
  config: HostedInferenceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HostedDeploymentStatus> {
  if (config.controlEndpoint && config.controlSecretEnvVar) {
    return callHostedControl(config, "wake", fetchImpl);
  }
  const readiness = await checkHostedReadiness(config, fetchImpl);
  return readiness.status === "ready"
    ? { status: "ready" }
    : { status: "starting", retryAfterMs: readiness.retryAfterMs };
}

export async function checkHostedReadiness(
  config: HostedInferenceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HostedReadinessResult> {
  const apiKey = hostedApiKey(config);
  if (config.apiKeyEnvVar && !apiKey) {
    throw new HostedInferenceError(
      `${config.apiKeyEnvVar} is not configured`,
      500,
    );
  }

  const response = await fetchImpl(
    `${config.endpoint.replace(/\/$/, "")}/models`,
    {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.ok) return { status: "ready" };
  if (response.status === 503) {
    return { status: "warming_up", retryAfterMs: 5_000 };
  }
  throw new HostedInferenceError(
    `Hosted readiness failed with status ${response.status}`,
    response.status,
  );
}

export async function invokeHostedInference(
  config: HostedInferenceConfig,
  input: PiroInput,
): Promise<HostedInferenceResult> {
  const apiKey = hostedApiKey(config);
  if (config.apiKeyEnvVar && !apiKey) {
    throw new HostedInferenceError(
      `${config.apiKeyEnvVar} is not configured`,
      500,
    );
  }

  const startedAt = Date.now();
  const response = await fetch(
    `${config.endpoint.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.apiModelName,
        messages: input.parts.map((part) => ({
          role: "user",
          content: part.text,
        })),
        temperature: 0,
        max_tokens: 128,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | HostedChatResponse
    | HostedErrorResponse
    | null;
  if (!response.ok) {
    const detail =
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Hosted inference failed with status ${response.status}`;
    throw new HostedInferenceError(detail, response.status);
  }

  const text =
    payload && "choices" in payload
      ? payload.choices?.[0]?.message?.content
      : undefined;
  if (typeof text !== "string") {
    throw new HostedInferenceError("Hosted model returned no text", 502);
  }

  return { text, durationMs: Date.now() - startedAt };
}

export class HostedInferenceError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus: number,
  ) {
    super(message);
    this.name = "HostedInferenceError";
  }
}
