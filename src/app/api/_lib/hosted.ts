import type { PiroInput } from "./contracts";

type HostedInferenceConfig = {
  endpoint: string;
  apiModelName: string;
  apiKeyEnvVar?: string | null;
};

type HostedChatResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

type HostedErrorResponse = {
  error?: unknown;
};

export type HostedInferenceResult = {
  text: string;
  durationMs: number;
};

export async function invokeHostedInference(
  config: HostedInferenceConfig,
  input: PiroInput,
): Promise<HostedInferenceResult> {
  const apiKey = config.apiKeyEnvVar
    ? process.env[config.apiKeyEnvVar]
    : undefined;
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
