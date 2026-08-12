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

const huggingFaceUploadResponseSchema = z.object({
  model: z.string(),
  revision: z.string(),
  prefix: z.string(),
  manifestKey: z.string(),
  fileCount: z.number(),
  totalBytes: z.number(),
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

export async function modelsDelete(modelId: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/admin/models/${encodeURIComponent(modelId)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    fail(response.status, response.body, "model deletion failed");
  }

  const result = z
    .object({ deleted: z.object({ id: z.string(), name: z.string() }) })
    .safeParse(response.body);
  if (!result.success) {
    console.error("Error: deletion response was invalid");
    process.exit(1);
  }

  console.log(
    `Deleted model ${result.data.deleted.name} (${result.data.deleted.id})`,
  );
}

export async function modelsUpload(
  model: string,
  revision: string,
): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/admin/huggingface-upload", {
    method: "POST",
    body: JSON.stringify({ model, revision }),
  });

  if (!response.ok) {
    fail(response.status, response.body, "Hugging Face model migration failed");
  }

  const result = huggingFaceUploadResponseSchema.safeParse(response.body);
  if (!result.success) {
    console.error("Error: migration response was invalid");
    process.exit(1);
  }

  console.log(
    `Uploaded ${result.data.model}@${result.data.revision}: ${result.data.fileCount} files (${result.data.totalBytes} bytes) under ${result.data.prefix}`,
  );
  console.log(`Manifest: ${result.data.manifestKey}`);
}
