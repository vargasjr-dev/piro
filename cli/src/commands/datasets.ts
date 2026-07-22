import { piroFetch, resolveConfig } from "../client.js";
import { getActiveRepoId } from "./repos.js";

interface DatasetSummary {
  id: string;
  name: string;
  sourcePath: string;
  sampleCount: number | null;
  generatedAt: string | null;
  createdAt: string;
}

function fail(status: number, body: unknown, fallback: string): never {
  const error = body as Record<string, unknown> | null;
  console.error(`Error ${status}: ${error?.error ?? fallback}`);
  process.exit(1);
}

async function activeRepo(config: ReturnType<typeof resolveConfig>): Promise<string> {
  const repoId = await getActiveRepoId();
  if (!repoId) fail(400, { error: "an active repository is required" }, "dataset lookup failed");
  return repoId;
}

export async function datasetsList(): Promise<void> {
  const config = resolveConfig();
  const repoId = await activeRepo(config);
  const response = await piroFetch(config, `/api/repos/${encodeURIComponent(repoId)}`);
  if (!response.ok) fail(response.status, response.body, "dataset listing failed");
  const datasets = (response.body as { datasets: DatasetSummary[] }).datasets;
  if (datasets.length === 0) {
    console.log("No datasets found.");
    return;
  }
  for (const dataset of datasets) {
    const samples = dataset.sampleCount === null ? "samples pending" : `${dataset.sampleCount.toLocaleString()} samples`;
    console.log(`${dataset.id}  ${dataset.name}  ${dataset.sourcePath}  ${samples}`);
  }
}

export async function datasetsGet(id: string): Promise<void> {
  const config = resolveConfig();
  await activeRepo(config);
  const response = await piroFetch(config, `/api/datasets/${encodeURIComponent(id)}`);
  if (!response.ok) fail(response.status, response.body, "dataset lookup failed");
  console.log(JSON.stringify(response.body, null, 2));
}

export async function datasetHead(id: string): Promise<void> {
  const config = resolveConfig();
  await activeRepo(config);
  const response = await piroFetch(
    config,
    `/api/datasets/${encodeURIComponent(id)}/head`,
  );
  if (!response.ok) fail(response.status, response.body, "dataset head failed");
  console.log(JSON.stringify(response.body, null, 2));
}
