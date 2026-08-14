import { test } from "node:test";
import { strict as assert } from "node:assert";
import { makeChatAdapter } from "./adapters";
import { getBenchmarkTarget } from "./targets";

test("Gemma benchmark target uses the configured Modal OpenAI-compatible endpoint", async () => {
  const config = getBenchmarkTarget("gemma:google/gemma-3-270m");
  assert.ok(config);
  assert.equal(config.apiModelName, "google/gemma-3-270m-it");
  assert.equal(
    config.endpoint,
    "https://dvargasfuertes--piro-gemma-vllm-server.us-east.modal.direct/v1",
  );

  const originalFetch = globalThis.fetch;
  try {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        choices: [{ message: { content: "value_014" } }],
        usage: { prompt_tokens: 11, completion_tokens: 2 },
      });
    };

    const result = await makeChatAdapter(config).generate("key_017");
    assert.equal(requests[0]?.url, `${config.endpoint}/chat/completions`);
    assert.equal(requests[0]?.body.model, "google/gemma-3-270m-it");
    assert.equal(result.inputTokens, 11);
    assert.equal(result.outputTokens, 2);
    assert.equal(result.tokenAccounting, "not_applicable");
    assert.equal(result.costAccounting, "modal_runtime");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
