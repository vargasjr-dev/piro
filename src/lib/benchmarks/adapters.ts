import type { GenerateResult, ModelAdapter } from "./types";
import type { ChatTargetConfig } from "./targets";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatCompletionResponse {
  choices: { message: { content: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

function completionUrl(endpoint: string): string {
  return `${endpoint.replace(/\/$/, "")}/chat/completions`;
}

async function chatCompletion(
  config: ChatTargetConfig,
  messages: ChatMessage[],
): Promise<GenerateResult> {
  const apiKey = config.apiKeyEnvVar
    ? process.env[config.apiKeyEnvVar]
    : undefined;
  if (config.apiKeyEnvVar && !apiKey) {
    throw new Error(`${config.apiKeyEnvVar} is not set`);
  }

  const isGpt5Nano = config.apiModelName === "gpt-5-nano";
  const body = isGpt5Nano
    ? {
        model: config.apiModelName,
        messages,
        reasoning_effort: "minimal",
        max_completion_tokens: 32,
      }
    : {
        model: config.apiModelName,
        messages,
        temperature: 0,
        max_tokens: 64,
      };

  const res = await fetch(completionUrl(config.endpoint), {
    method: "POST",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${config.name} error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  return {
    text: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    tokenAccounting: config.tokenAccounting,
  };
}

const SEQUENCE_SYSTEM_PROMPT =
  "You receive one associative-memory observation per invocation. Maintain facts across invocations. For writes and distractors, reply only ACK. When the user message is a key_NNN query, reply only the exact value_NNN associated with that key. Do not explain.";

export function makeChatAdapter(config: ChatTargetConfig): ModelAdapter {
  return {
    name: config.name,
    targetKey: config.targetKey,
    pricing: config.pricing,
    tokenAccounting: config.tokenAccounting,
    async generate(prompt: string): Promise<GenerateResult> {
      return chatCompletion(config, [{ role: "user", content: prompt }]);
    },
    async generateSequence(inputs: string[]): Promise<GenerateResult> {
      if (inputs.length < 2) {
        throw new Error(
          "Associative Recall evaluation requires at least two inputs",
        );
      }

      const messages: ChatMessage[] = [
        { role: "system", content: SEQUENCE_SYSTEM_PROMPT },
      ];
      let finalResult: GenerateResult | null = null;
      let inputTokens = 0;
      let outputTokens = 0;
      for (const content of inputs) {
        messages.push({ role: "user", content });
        const result = await chatCompletion(config, messages);
        finalResult = result;
        inputTokens += result.inputTokens;
        outputTokens += result.outputTokens;
        messages.push({ role: "assistant", content: result.text });
      }
      return {
        text: finalResult?.text ?? "",
        inputTokens,
        outputTokens,
        tokenAccounting: config.tokenAccounting,
      };
    },
  };
}

export function makeGPTAdapter(modelName: string): ModelAdapter {
  return makeChatAdapter({
    targetKey: `openai:${modelName}`,
    name: modelName,
    endpoint: "https://api.openai.com/v1",
    apiModelName: modelName,
    apiKeyEnvVar: "OPENAI_API_KEY",
    pricing:
      modelName === "gpt-5-nano"
        ? { inputPerMillion: 0.05, outputPerMillion: 0.4 }
        : undefined,
    tokenAccounting: "provider_usage",
  });
}

interface ModalState {
  previous_activations: number[] | null;
  history_entries: number[][];
  plastic_weights?: number[][];
  plastic_ticks?: number;
  burst_counter?: number[];
  refractory_counter?: number[];
  phases?: number[];
}

interface ModalInferResponse {
  text: string;
  durationMs: number;
  state?: ModalState;
  error?: string;
}

export function makePiroModelAdapter(
  modelId: string,
  modelName: string,
  inferenceEndpoint: string,
): ModelAdapter {
  return {
    name: modelName,
    targetKey: modelId,
    tokenAccounting: "not_applicable",
    async generate(prompt: string): Promise<GenerateResult> {
      const response = await requestModal({
        modelId,
        inferenceEndpoint,
        prompt,
      });
      return {
        text: response.text ?? "",
        inputTokens: 0,
        outputTokens: 0,
        tokenAccounting: "not_applicable",
      };
    },
    async generateSequence(inputs: string[]): Promise<GenerateResult> {
      if (inputs.length < 2) {
        throw new Error(
          "Associative Recall evaluation requires at least two inputs",
        );
      }

      let state: ModalState | undefined;
      let result: GenerateResult = {
        text: "",
        inputTokens: 0,
        outputTokens: 0,
        tokenAccounting: "not_applicable",
      };
      for (const input of inputs) {
        const response = await requestModal({
          modelId,
          inferenceEndpoint,
          input,
          state,
        });
        if (!response.state)
          throw new Error("Piro inference did not return recurrent state");
        state = response.state;
        result = {
          text: response.text,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          tokenAccounting: "not_applicable",
        };
      }
      return result;
    },
  };
}

async function requestModal({
  modelId,
  inferenceEndpoint,
  prompt,
  input,
  state,
}: {
  modelId: string;
  inferenceEndpoint: string;
  prompt?: string;
  input?: string;
  state?: ModalState;
}): Promise<ModalInferResponse> {
  const secret = process.env.MODAL_WEBHOOK_SECRET ?? "";
  const res = await fetch(inferenceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: modelId,
      ...(input !== undefined
        ? { input, ...(state ? { state } : {}) }
        : { prompt }),
      secret,
    }),
  });
  if (!res.ok)
    throw new Error(`Piro inference error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as ModalInferResponse;
  if (data.error) throw new Error(`Piro inference error: ${data.error}`);
  return data;
}
