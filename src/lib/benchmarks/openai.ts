import type { ModelAdapter, GenerateResult } from "./types";

// ── Pricing (USD per 1M tokens, as of June 2025) ──────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o":      { input: 2.50, output: 10.00 },
};

export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

// ── OpenAI chat completion via raw fetch (no SDK dependency) ──────────────────

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatCompletionResponse {
  choices: { message: { content: string | null } }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
): Promise<GenerateResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 64,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${model} error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const text = data.choices[0]?.message?.content ?? "";
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  return { text, inputTokens, outputTokens };
}

// ── GPT model adapter ─────────────────────────────────────────────────────────

export function makeGPTAdapter(modelName: string): ModelAdapter {
  return {
    name: modelName,
    async generate(prompt: string): Promise<GenerateResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
      return chatCompletion(modelName, [{ role: "user", content: prompt }], apiKey);
    },
  };
}

// ── Piro student stub (random noise — real model not yet implemented) ─────────

export function makePiroStudentAdapter(): ModelAdapter {
  return {
    name: "piro-student",
    isStub: true,
    async generate(_prompt: string): Promise<GenerateResult> {
      // Intentionally terrible: returns a random integer string.
      // Replace with real inference once the model is trained.
      return { text: String(Math.floor(Math.random() * 1000)), inputTokens: 0, outputTokens: 0 };
    },
  };
}
