import type { ModelAdapter } from "./types";

// ── OpenAI chat completion via raw fetch (no SDK dependency) ──────────────────

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatCompletionResponse {
  choices: { message: { content: string | null } }[];
}

async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
): Promise<string> {
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
  return data.choices[0]?.message?.content ?? "";
}

// ── GPT model adapter ─────────────────────────────────────────────────────────

export function makeGPTAdapter(modelName: string): ModelAdapter {
  return {
    name: modelName,
    async generate(prompt: string): Promise<string> {
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
    async generate(_prompt: string): Promise<string> {
      // Intentionally terrible: returns a random integer string
      // Replace with real inference once the model is trained.
      return String(Math.floor(Math.random() * 1000));
    },
  };
}
