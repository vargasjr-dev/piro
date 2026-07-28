import { piroFetch, resolveConfig } from "../client.js";
import { errorMessage } from "../response-schemas.js";

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
  process.exit(1);
}

/** Normalize an architecture name into its canonical entrypoint path. */
export function architecturePath(name: string): string {
  const trimmed = name.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new Error("architecture name is required");

  const path = trimmed.startsWith("architectures/")
    ? trimmed
    : `architectures/${trimmed}`;
  return path.endsWith("/main.py") ? path : `${path}/main.py`;
}

export async function architectureTrain(
  name: string,
  opts: { dataset: string; maxSteps?: string; modelName?: string },
): Promise<void> {
  const config = resolveConfig();
  const maxSteps = opts.maxSteps === undefined ? 5000 : Number(opts.maxSteps);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    console.error("Error: --max-steps must be a positive integer");
    process.exit(1);
  }

  const response = await piroFetch(config, "/api/training-runs", {
    method: "POST",
    body: JSON.stringify({
      architecturePath: architecturePath(name),
      datasetId: opts.dataset,
      maxSteps,
      ...(opts.modelName ? { modelName: opts.modelName } : {}),
    }),
  });
  if (!response.ok) {
    fail(response.status, response.body, "training run creation failed");
  }

  console.log(JSON.stringify(response.body, null, 2));
}
