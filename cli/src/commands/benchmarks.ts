import { piroFetch, resolveConfig } from "../client.js";

function fail(status: number, body: unknown, fallback: string): never {
  const error = body as Record<string, unknown> | null;
  console.error(`Error ${status}: ${error?.error ?? fallback}`);
  process.exit(1);
}

export async function benchmarksEval(name: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/evals", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) fail(response.status, response.body, "benchmark evaluation failed to start");
  console.log(JSON.stringify(response.body, null, 2));
}
