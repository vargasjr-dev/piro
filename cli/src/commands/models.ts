import { piroFetch, resolveConfig } from "../client.js";

function fail(status: number, body: unknown, fallback: string): never {
  const error = body as Record<string, unknown> | null;
  console.error(`Error ${status}: ${error?.error ?? fallback}`);
  process.exit(1);
}

export async function modelsDeploy(
  modelId: string,
  opts: { admin?: boolean } = {},
): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/models/${encodeURIComponent(modelId)}/deploy`,
    {
      method: "POST",
      body: JSON.stringify(opts.admin ? { admin: true } : {}),
    },
  );

  if (!response.ok) {
    fail(response.status, response.body, "model deployment failed");
  }

  const result = response.body as {
    deployment?: { id?: string; modelId?: string; enabled?: boolean };
    created?: boolean;
  };
  const deployment = result.deployment;
  console.log(
    `${result.created === false ? "Deployment already exists" : "Created deployment"} ${deployment?.id ?? "?"} for model ${deployment?.modelId ?? modelId}${opts.admin ? " (admin)" : ""}`,
  );
}
