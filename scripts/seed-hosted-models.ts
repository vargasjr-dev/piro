import { db } from "../data/db";
import { model, modelHostedApi, user } from "../data/schema";

const GEMMA_MODEL_ID = "gemma-3-270m";
const GEMMA_API_ID = "gemma-3-270m-api";
const GEMMA_ENDPOINT =
  "https://dvargasfuertes--piro-gemma-vllm-server.modal.run/v1";

const hostedModels = [
  {
    id: GEMMA_MODEL_ID,
    apiId: GEMMA_API_ID,
    name: "Gemma 3 270M",
    description: "Google Gemma 3 270M served through the Piro Gemma endpoint.",
    provider: "modal",
    apiModelName: "google/gemma-3-270m",
    endpoint: GEMMA_ENDPOINT,
  },
] as const;

const [owner] = await db.select({ id: user.id }).from(user).limit(1);

if (!owner) {
  throw new Error("Cannot seed hosted models before a user exists");
}

for (const hosted of hostedModels) {
  await db
    .insert(model)
    .values({
      id: hosted.id,
      userId: owner.id,
      name: hosted.name,
      description: hosted.description,
    })
    .onConflictDoNothing({ target: model.id });

  await db
    .insert(modelHostedApi)
    .values({
      id: hosted.apiId,
      modelId: hosted.id,
      provider: hosted.provider,
      apiModelName: hosted.apiModelName,
      endpoint: hosted.endpoint,
      apiKeyEnvVar: null,
      tokenAccounting: "not_applicable",
    })
    .onConflictDoNothing({ target: modelHostedApi.modelId });

  console.log(`Seeded hosted model ${hosted.name}`);
}
