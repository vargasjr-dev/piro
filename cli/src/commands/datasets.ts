import { piroFetch, resolveConfig } from "../client.js";
import { errorMessage } from "../response-schemas.js";

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
  process.exit(1);
}

export async function datasetsGet(id: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/datasets/${encodeURIComponent(id)}`,
  );
  if (!response.ok)
    fail(response.status, response.body, "dataset lookup failed");
  console.log(JSON.stringify(response.body, null, 2));
}

export async function datasetHead(id: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/datasets/${encodeURIComponent(id)}/head`,
  );
  if (!response.ok) fail(response.status, response.body, "dataset head failed");
  console.log(JSON.stringify(response.body, null, 2));
}
