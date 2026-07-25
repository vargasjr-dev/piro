import { piroFetch, resolveConfig } from "../client.js";
import { errorMessage } from "../response-schemas.js";

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
  process.exit(1);
}

export async function benchmarksEval(name: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/evals", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    fail(
      response.status,
      response.body,
      "benchmark evaluation failed to start",
    );
  }
  console.log(JSON.stringify(response.body, null, 2));
}
