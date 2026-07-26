import { test } from "node:test";
import { strict as assert } from "node:assert";
import { makeGPTAdapter, makePiroModelAdapter } from "./adapters";

test("GPT Associative Recall sequence uses one request per input and aggregates usage", async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";

  try {
    const requests: Array<{
      messages: Array<{ role: string; content: string }>;
    }> = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return Response.json({
        choices: [{ message: { content: "ACK" } }],
        usage: { prompt_tokens: requests.length * 10, completion_tokens: 2 },
      });
    };

    const result = await makeGPTAdapter("gpt-5-nano").generateSequence!([
      "key_017 = value_014",
      "token_005_027",
      "token_011_003",
      "key_017",
    ]);

    assert.equal(requests.length, 4);
    assert.deepEqual(
      requests.map(
        (request) =>
          request.messages.filter((message) => message.role === "user").at(-1)
            ?.content,
      ),
      ["key_017 = value_014", "token_005_027", "token_011_003", "key_017"],
    );
    assert.deepEqual(
      requests.map((request) => request.messages.length),
      [2, 4, 6, 8],
    );
    assert.equal(result.text, "ACK");
    assert.equal(result.inputTokens, 100);
    assert.equal(result.outputTokens, 8);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
  }
});

test("Piro Associative Recall sequence passes returned state to the next request", async () => {
  const originalFetch = globalThis.fetch;
  const originalModalSecret = process.env.MODAL_WEBHOOK_SECRET;
  process.env.MODAL_WEBHOOK_SECRET = "test-modal-secret";

  try {
    const requests: Array<Record<string, unknown>> = [];
    const states = [
      { previous_activations: null, history_entries: [] },
      { previous_activations: [1], history_entries: [[2]] },
      { previous_activations: [3], history_entries: [[4]] },
      { previous_activations: [5], history_entries: [[6]] },
    ];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return Response.json({
        text: "ACK",
        durationMs: 1,
        state: states[requests.length - 1],
      });
    };

    const result = await makePiroModelAdapter(
      "model-1",
      "piro-ctm",
      "https://modal.test/infer",
    ).generateSequence!([
      "key_017 = value_014",
      "token_005_027",
      "token_011_003",
      "key_017",
    ]);

    assert.equal(requests.length, 4);
    assert.deepEqual(
      requests.map((request) => request.input),
      ["key_017 = value_014", "token_005_027", "token_011_003", "key_017"],
    );
    assert.equal(requests[0].state, undefined);
    assert.deepEqual(requests[1].state, states[0]);
    assert.deepEqual(requests[2].state, states[1]);
    assert.deepEqual(requests[3].state, states[2]);
    assert.equal(result.text, "ACK");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModalSecret === undefined)
      delete process.env.MODAL_WEBHOOK_SECRET;
    else process.env.MODAL_WEBHOOK_SECRET = originalModalSecret;
  }
});
