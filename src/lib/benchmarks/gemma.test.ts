import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  GEMMA_API_URL,
  GEMMA_MODEL_ID,
  GEMMA_TARGET,
  makeGemmaAdapter,
} from "./gemma";

test("Gemma adapter sends text generation requests to the configured endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMMA_API_KEY;
  process.env.GEMMA_API_KEY = "test-gemma-key";

  try {
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return Response.json({
        choices: [{ message: { content: " value_014 " } }],
        usage: { prompt_tokens: 11, completion_tokens: 2 },
      });
    };

    const adapter = makeGemmaAdapter();
    const result = await adapter.generate("key_017");

    assert.equal(adapter.name, "Gemma 3 270M PT");
    assert.equal(adapter.targetKey, GEMMA_TARGET);
    assert.equal(request?.url, `${GEMMA_API_URL}/chat/completions`);
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      model: GEMMA_MODEL_ID,
      messages: [{ role: "user", content: "key_017" }],
      max_tokens: 64,
      temperature: 0,
    });
    assert.equal(request?.init?.headers instanceof Headers, false);
    assert.equal(result.text, "value_014");
    assert.equal(result.inputTokens, 11);
    assert.equal(result.outputTokens, 2);
    assert.equal(result.tokenAccounting, "provider_usage");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMMA_API_KEY;
    else process.env.GEMMA_API_KEY = originalKey;
  }
});

test("Gemma adapter replays ordered inputs as one growing conversation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMMA_API_KEY;
  process.env.GEMMA_API_KEY = "test-gemma-key";
  try {
    const prompts: string[] = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      prompts.push(
        body.messages
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n"),
      );
      return Response.json({
        choices: [
          {
            message: {
              content: prompts.length === 2 ? "value_014" : "ACK",
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 1 },
      });
    };

    const result = await makeGemmaAdapter().generateSequence!([
      "key_017 = value_014",
      "key_017",
    ]);

    assert.equal(prompts.length, 2);
    assert.equal(prompts[0].includes("key_017 = value_014"), true);
    assert.equal(prompts[1].includes("ACK"), true);
    assert.equal(prompts[1].includes("key_017"), true);
    assert.equal(result.text, "value_014");
    assert.equal(result.inputTokens, 20);
    assert.equal(result.outputTokens, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMMA_API_KEY;
    else process.env.GEMMA_API_KEY = originalKey;
  }
});
