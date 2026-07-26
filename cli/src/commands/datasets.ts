import { z } from "zod";
import { piroFetch, resolveConfig } from "../client.js";
import { datasetSummarySchema, errorMessage } from "../response-schemas.js";

const datasetsResponseSchema = z.object({
  datasets: z.array(datasetSummarySchema),
});

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
  process.exit(1);
}

export async function datasetsList(): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/datasets");
  if (!response.ok)
    fail(response.status, response.body, "dataset listing failed");
  const parsed = datasetsResponseSchema.safeParse(response.body);
  if (!parsed.success)
    fail(502, response.body, "dataset listing response was invalid");

  if (parsed.data.datasets.length === 0) {
    console.log("No datasets found.");
    return;
  }
  for (const dataset of parsed.data.datasets) {
    const samples =
      dataset.sampleCount === null
        ? "samples pending"
        : `${dataset.sampleCount.toLocaleString()} samples`;
    console.log(
      `${dataset.id}  ${dataset.name}  ${dataset.sourcePath}  ${samples}`,
    );
  }
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
