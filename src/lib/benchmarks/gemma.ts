import type { GenerateResult, ModelAdapter } from "./types";

export const GEMMA_MODEL_ID = "google/gemma-3-270m";
export const GEMMA_TARGET = `gemma:${GEMMA_MODEL_ID}`;
export const GEMMA_API_URL = "https://router.huggingface.co/v1";

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
}

async function completion(
  messages: ChatMessage[],
  apiKey: string,
): Promise<GenerateResult> {
  const request: CompletionRequest = {
    model: GEMMA_MODEL_ID,
    messages,
    max_tokens: 64,
    temperature: 0,
  };
  const response = await fetch(`${GEMMA_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gemma ${GEMMA_MODEL_ID} error ${response.status}: ${body}`,
    );
  }

  const data = (await response.json()) as CompletionResponse;
  return {
    text: data.choices?.[0]?.message?.content?.trim() ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    tokenAccounting: "provider_usage",
  };
}

function getConfig(): { apiKey: string } {
  const apiKey = process.env.GEMMA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMMA_API_KEY is not set; create a Hugging Face token at https://huggingface.co/settings/tokens",
    );
  }
  return { apiKey };
}

export function makeGemmaAdapter(): ModelAdapter {
  return {
    name: "Gemma 3 270M PT",
    targetKey: GEMMA_TARGET,
    async generate(prompt: string): Promise<GenerateResult> {
      const config = getConfig();
      return completion([{ role: "user", content: prompt }], config.apiKey);
    },
    async generateSequence(inputs: string[]): Promise<GenerateResult> {
      if (inputs.length < 2) {
        throw new Error("Ashfall evaluation requires at least two inputs");
      }
      const config = getConfig();
      const transcript: ChatMessage[] = [
        {
          role: "system",
          content:
            "You receive one associative-memory observation per invocation. Maintain facts across invocations. For writes and distractors, reply only ACK. When the user message is a key_NNN query, reply only the exact value_NNN associated with that key. Do not explain.",
        },
      ];
      let finalResult: GenerateResult = {
        text: "",
        inputTokens: 0,
        outputTokens: 0,
        tokenAccounting: "provider_usage",
      };
      for (const input of inputs) {
        transcript.push({ role: "user", content: input });
        const result = await completion(transcript, config.apiKey);
        finalResult = {
          text: result.text,
          inputTokens: finalResult.inputTokens + result.inputTokens,
          outputTokens: finalResult.outputTokens + result.outputTokens,
          tokenAccounting: "provider_usage",
        };
        transcript.push({ role: "assistant", content: result.text });
      }
      return finalResult;
    },
  };
}
