import { z } from "zod";
import { piroFetch, resolveConfig } from "../client.js";

const deploymentResponseSchema = z.object({
  deployment: z.object({
    id: z.string(),
    modelId: z.string(),
    enabled: z.boolean(),
  }),
  created: z.boolean().optional(),
});

function fail(status: number, body: unknown, fallback: string): never {
  const error = z.object({ error: z.string() }).safeParse(body);
  console.error(
    `Error ${status}: ${error.success ? error.data.error : fallback}`,
  );
  process.exit(1);
}

export async function modelsDeploy(modelId: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/models/${encodeURIComponent(modelId)}/deploy`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    fail(response.status, response.body, "model deployment failed");
  }

  const result = deploymentResponseSchema.safeParse(response.body);
  if (!result.success) {
    console.error("Error: deployment response was invalid");
    process.exit(1);
  }

  const { deployment, created } = result.data;
  console.log(
    `${created === false ? "Deployment already exists" : "Created deployment"} ${deployment.id} for model ${deployment.modelId}`,
  );
}
