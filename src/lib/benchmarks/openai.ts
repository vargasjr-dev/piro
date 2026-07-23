import type { GenerateResult, ModelAdapter } from "./types";

// USD per 1M tokens. GPT-5 nano pricing verified against the OpenAI model
// catalog on July 23, 2026.
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;
}

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

async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
): Promise<GenerateResult> {
  const isGpt5Nano = model === "gpt-5-nano";
  const body = isGpt5Nano
    ? {
        model,
        messages,
        // GPT-5 nano is a reasoning model. `minimal` is its lowest documented
        // reasoning effort; reasoning tokens are included in this cap and cost.
        reasoning_effort: "minimal",
        max_completion_tokens: 32,
      }
    : {
        model,
        messages,
        temperature: 0,
        max_tokens: 64,
      };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${model} error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  return {
    text: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export function makeGPTAdapter(modelName: string): ModelAdapter {
  return {
    name: modelName,
    targetKey: `openai:${modelName}`,
    async generate(prompt: string): Promise<GenerateResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
      return chatCompletion(modelName, [{ role: "user", content: prompt }], apiKey);
    },
    async generateInputs(inputs: string[]): Promise<GenerateResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
      return chatCompletion(
        modelName,
        [
          {
            role: "system",
            content:
              "Return only the exact value associated with the queried key, such as value_014. Do not explain.",
          },
          ...inputs.map((content) => ({ role: "user" as const, content })),
        ],
        apiKey,
      );
    },
  };
}

interface ModalInferResponse {
  text: string;
  durationMs: number;
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
    async generate(prompt: string): Promise<GenerateResult> {
      return requestModal({ modelId, inferenceEndpoint, prompt });
    },
    async generateInputs(inputs: string[]): Promise<GenerateResult> {
      return requestModal({ modelId, inferenceEndpoint, inputs });
    },
  };
}

async function requestModal({
  modelId,
  inferenceEndpoint,
  prompt,
  inputs,
}: {
  modelId: string;
  inferenceEndpoint: string;
  prompt?: string;
  inputs?: string[];
}): Promise<GenerateResult> {
  const secret = process.env.MODAL_WEBHOOK_SECRET ?? "";
  const res = await fetch(inferenceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId, ...(inputs ? { inputs } : { prompt }), secret }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Piro inference error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as ModalInferResponse;
  if (data.error) throw new Error(`Piro inference error: ${data.error}`);
  return { text: data.text ?? "", inputTokens: 0, outputTokens: 0 };
}
