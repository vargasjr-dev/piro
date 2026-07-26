import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import {
  deployment,
  model,
  modelHostedApi,
  modelTrainingRun,
  benchmarkRun,
} from "../../../../data/schema";
import { getSubscription, isActive } from "~/lib/billing";
import { getLatestPiroModel } from "~/lib/latest-experiment";
import { modelIdSchema } from "~/lib/model-identifiers";
import { eq, sql } from "drizzle-orm";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await getSubscription(session.user.id);
  if (!isActive(subscription)) {
    return Response.json(
      { error: "An active subscription is required to deploy a model" },
      { status: 402 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const requestedId =
    typeof body === "object" && body !== null && "modelId" in body
      ? (body as { modelId?: unknown }).modelId
      : undefined;
  const parsed = modelIdSchema.safeParse(requestedId);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid model ID" },
      { status: 400 },
    );
  }

  const modelId = parsed.data;
  const latest = getLatestPiroModel();
  let createdModel: typeof model.$inferSelect | undefined;
  try {
    [createdModel] = await db
      .insert(model)
      .values({
        id: modelId,
        userId: session.user.id,
        name: modelId,
        description: `${latest.label} private deployment`,
      })
      .returning();

    const [createdDeployment] = await db
      .insert(deployment)
      .values({
        id: randomUUID(),
        modelId: createdModel.id,
        createdByUserId: session.user.id,
        isAdmin: false,
        enabled: true,
      })
      .returning();

    return Response.json(
      { model: createdModel, deployment: createdDeployment },
      { status: 201 },
    );
  } catch (error) {
    if (createdModel) {
      try {
        await db.delete(model).where(eq(model.id, createdModel.id));
      } catch (cleanupError) {
        console.error(
          "Failed to clean up an incomplete model deployment",
          cleanupError,
        );
      }
    }
    if (isUniqueViolation(error)) {
      return Response.json(
        { error: "That model ID is already in use. Choose another one." },
        { status: 409 },
      );
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const models = await db
    .select()
    .from(model)
    .where(eq(model.userId, session.user.id))
    .orderBy(model.createdAt);

  // Fetch hosted API info for all models
  const hostedApis = await db
    .select()
    .from(modelHostedApi)
    .where(
      eq(
        modelHostedApi.modelId,
        sql`ANY(ARRAY[${sql.join(
          models.map((m) => sql`${m.id}`),
          sql`, `,
        )}])`,
      ),
    );

  // Fetch training run links
  const trainingLinks = await db
    .select()
    .from(modelTrainingRun)
    .where(
      eq(
        modelTrainingRun.modelId,
        sql`ANY(ARRAY[${sql.join(
          models.map((m) => sql`${m.id}`),
          sql`, `,
        )}])`,
      ),
    );

  // Benchmark run counts per model (target = model.id)
  const counts = await db
    .select({
      target: benchmarkRun.target,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(benchmarkRun)
    .where(eq(benchmarkRun.userId, session.user.id))
    .groupBy(benchmarkRun.target);

  const countByTarget = Object.fromEntries(
    counts.map((c) => [c.target, c.count]),
  );
  const hostedByModelId = Object.fromEntries(
    hostedApis.map((h) => [h.modelId, h]),
  );
  const trainingByModelId = Object.fromEntries(
    trainingLinks.map((t) => [t.modelId, t]),
  );

  return Response.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      parameterCount: m.parameterCount,
      createdAt: m.createdAt.toISOString(),
      hostedApi: hostedByModelId[m.id]
        ? {
            provider: hostedByModelId[m.id].provider,
            apiModelName: hostedByModelId[m.id].apiModelName,
          }
        : null,
      trainingRunId: trainingByModelId[m.id]?.trainingRunId ?? null,
      benchmarkRunCount: countByTarget[m.id] ?? 0,
    })),
  });
}
