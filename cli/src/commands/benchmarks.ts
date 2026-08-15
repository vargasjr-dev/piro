import { piroFetch, resolveConfig } from "../client.js";
import { errorMessage } from "../response-schemas.js";

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
  process.exit(1);
}

export interface BenchmarkEvalOptions {
  dataset: string;
  targets: string[];
  episodes?: number;
}

export async function benchmarksEval(
  options: BenchmarkEvalOptions,
): Promise<void> {
  if (!options.dataset) fail(400, {}, "--dataset is required");
  if (options.targets.length === 0)
    fail(400, {}, "at least one --target is required");

  const config = resolveConfig();
  const response = await piroFetch(config, "/api/evals", {
    method: "POST",
    body: JSON.stringify({
      datasetId: options.dataset,
      targets: options.targets,
      ...(options.episodes === undefined ? {} : { episodes: options.episodes }),
    }),
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
