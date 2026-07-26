import type { GenerateResult, ModelAdapter } from "./types";

export const GEMMA_MODEL_ID = "google/gemma-3-270m";
export const GEMMA_TARGET = `gemma:${GEMMA_MODEL_ID}`;

interface CompletionResponse {
  choices?: Array<{ text?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface CompletionRequest {
  model: string;
  prompt: string;
  max_tokens: number;
  temperature: number;
}

async function completion(
  prompt: string,
  baseUrl: string,
  apiKey: string,
): Promise<GenerateResult> {
  const request: CompletionRequest = {
    model: GEMMA_MODEL_ID,
    prompt,
    max_tokens: 64,
    temperature: 0,
  };
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/completions`, {
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
    text: data.choices?.[0]?.text?.trim() ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    tokenAccounting: "provider_usage",
  };
}

function getConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.GEMMA_API_URL;
  if (!baseUrl) {
    throw new Error(
      "GEMMA_API_URL is not set; configure an OpenAI-compatible endpoint serving google/gemma-3-270m",
    );
  }
  return {
    baseUrl,
    apiKey: process.env.GEMMA_API_KEY ?? "",
  };
}

export function makeGemmaAdapter(): ModelAdapter {
  return {
    name: "Gemma 3 270M PT",
    targetKey: GEMMA_TARGET,
    async generate(prompt: string): Promise<GenerateResult> {
      const config = getConfig();
      return completion(prompt, config.baseUrl, config.apiKey);
    },
    async generateSequence(inputs: string[]): Promise<GenerateResult> {
      if (inputs.length < 2) {
        throw new Error("Ashfall evaluation requires at least two inputs");
      }
      const config = getConfig();
      const transcript = [
        "You receive one associative-memory observation per invocation. Maintain facts across invocations. For writes and distractors, reply only ACK. When the user message is a key_NNN query, reply only the exact value_NNN associated with that key. Do not explain.",
      ];
      let finalResult: GenerateResult = {
        text: "",
        inputTokens: 0,
        outputTokens: 0,
        tokenAccounting: "provider_usage",
      };
      for (const input of inputs) {
        transcript.push(`Observation: ${input}\nResponse:`);
        const result = await completion(
          transcript.join("\n\n"),
          config.baseUrl,
          config.apiKey,
        );
        finalResult = {
          text: result.text,
          inputTokens: finalResult.inputTokens + result.inputTokens,
          outputTokens: finalResult.outputTokens + result.outputTokens,
          tokenAccounting: "provider_usage",
        };
        transcript.push(result.text);
      }
      return finalResult;
    },
  };
}
