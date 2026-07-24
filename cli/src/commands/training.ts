import { piroFetch, resolveConfig } from "../client.js";

function fail(status: number, body: unknown, fallback: string): never {
  const error = body as Record<string, unknown> | null;
  console.error(`Error ${status}: ${error?.error ?? fallback}`);
  process.exit(1);
}

export async function trainingList(): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/training-runs");
  if (!response.ok)
    fail(response.status, response.body, "training run listing failed");
  console.log(JSON.stringify(response.body, null, 2));
}

export async function trainingGet(id: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/training-runs/${encodeURIComponent(id)}`,
  );
  if (!response.ok)
    fail(response.status, response.body, "training run lookup failed");
  console.log(JSON.stringify(response.body, null, 2));
}
