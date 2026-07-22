import { piroFetch, resolveConfig } from "../client.js";

function fail(status: number, body: unknown, fallback: string): never {
  const error = body as Record<string, unknown> | null;
  console.error(`Error ${status}: ${error?.error ?? fallback}`);
  process.exit(1);
}

/**
 * Normalize the user-facing architecture name into the repository path stored
 * on a training run. Bare names use the repository convention; full paths are
 * preserved so experiment-scoped architectures remain addressable.
 */
export function architecturePath(name: string): string {
  const trimmed = name.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new Error("architecture name is required");
  if (
    trimmed.startsWith("architectures/") ||
    trimmed.startsWith("experiments/")
  ) {
    return trimmed;
  }
  return `architectures/${trimmed}`;
}

export async function architectureTrain(
  name: string,
  opts: { dataset: string; epochs?: string; modelName?: string },
): Promise<void> {
  const config = resolveConfig();
  const epochs = opts.epochs === undefined ? 10 : Number(opts.epochs);
  if (!Number.isInteger(epochs) || epochs < 1) {
    console.error("Error: --epochs must be a positive integer");
    process.exit(1);
  }

  const response = await piroFetch(config, "/api/training-runs", {
    method: "POST",
    body: JSON.stringify({
      architecturePath: architecturePath(name),
      datasetId: opts.dataset,
      epochs,
      ...(opts.modelName ? { modelName: opts.modelName } : {}),
    }),
  });
  if (!response.ok)
    fail(response.status, response.body, "training run creation failed");

  console.log(JSON.stringify(response.body, null, 2));
}
