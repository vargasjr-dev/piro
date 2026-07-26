import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import {
  benchmarkRun,
  deployment,
  model,
  modelHostedApi,
  modelTrainingRun,
} from "../../../../data/schema";
import { getSubscription, isActive } from "~/lib/billing";
import { modelIdSchema } from "~/lib/model-identifiers";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

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
  const sourceModelId =
    typeof body === "object" && body !== null && "sourceModelId" in body
      ? (body as { sourceModelId?: unknown }).sourceModelId
      : undefined;
  const parsed = modelIdSchema.safeParse(requestedId);
  if (typeof sourceModelId !== "string" || sourceModelId.length === 0) {
    return Response.json(
      { error: "A pretrained model is required" },
      { status: 400 },
    );
  }
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid deployment ID" },
      { status: 400 },
    );
  }

  const deploymentId = parsed.data;
  const [sourceModel] = await db
    .select({
      id: model.id,
      name: model.name,
      parameterCount: model.parameterCount,
      weightsR2Key: model.weightsR2Key,
      inferenceEndpoint: model.inferenceEndpoint,
      trainingRunId: modelTrainingRun.trainingRunId,
    })
    .from(deployment)
    .innerJoin(model, eq(deployment.modelId, model.id))
    .innerJoin(modelTrainingRun, eq(modelTrainingRun.modelId, model.id))
    .where(
      and(
        eq(model.id, sourceModelId),
        eq(deployment.isAdmin, true),
        eq(deployment.enabled, true),
        isNull(deployment.targetUserId),
        isNull(model.archivedAt),
        isNotNull(model.weightsR2Key),
        isNotNull(model.inferenceEndpoint),
      ),
    )
    .limit(1);
  if (!sourceModel) {
    return Response.json(
      { error: "That pretrained model is not available" },
      { status: 400 },
    );
  }

  const [conflictingModel, conflictingDeployment] = await Promise.all([
    db
      .select({ id: model.id })
      .from(model)
      .where(eq(model.id, deploymentId))
      .limit(1),
    db
      .select({ id: deployment.id })
      .from(deployment)
      .where(eq(deployment.id, deploymentId))
      .limit(1),
  ]);
  if (conflictingModel[0] || conflictingDeployment[0]) {
    return Response.json(
      { error: "That deployment ID is already in use. Choose another one." },
      { status: 409 },
    );
  }

  try {
    const [createdDeployment] = await db
      .insert(deployment)
      .values({
        id: deploymentId,
        modelId: sourceModel.id,
        createdByUserId: session.user.id,
        isAdmin: false,
        enabled: true,
      })
      .returning();

    revalidatePath("/models");

    return Response.json(
      { model: sourceModel, deployment: createdDeployment },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json(
        { error: "That deployment ID is already in use. Choose another one." },
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

  const deployments = await db
    .select({
      id: deployment.id,
      modelId: model.id,
      name: deployment.id,
      description: model.description,
      parameterCount: model.parameterCount,
      createdAt: deployment.createdAt,
    })
    .from(deployment)
    .innerJoin(model, eq(deployment.modelId, model.id))
    .where(
      and(
        eq(deployment.createdByUserId, session.user.id),
        eq(deployment.isAdmin, false),
        isNull(model.archivedAt),
      ),
    )
    .orderBy(desc(deployment.createdAt));

  const modelIds = deployments.map((item) => item.modelId);
  const hostedApis = modelIds.length
    ? await db
        .select()
        .from(modelHostedApi)
        .where(inArray(modelHostedApi.modelId, modelIds))
    : [];
  const trainingLinks = modelIds.length
    ? await db
        .select()
        .from(modelTrainingRun)
        .where(inArray(modelTrainingRun.modelId, modelIds))
    : [];

  const counts = await db
    .select({
      target: benchmarkRun.target,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(benchmarkRun)
    .where(eq(benchmarkRun.userId, session.user.id))
    .groupBy(benchmarkRun.target);

  const countByTarget = Object.fromEntries(
    counts.map((item) => [item.target, item.count]),
  );
  const hostedByModelId = Object.fromEntries(
    hostedApis.map((item) => [item.modelId, item]),
  );
  const trainingByModelId = Object.fromEntries(
    trainingLinks.map((item) => [item.modelId, item]),
  );

  return Response.json({
    models: deployments.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      parameterCount: item.parameterCount,
      createdAt: item.createdAt.toISOString(),
      hostedApi: hostedByModelId[item.modelId]
        ? {
            provider: hostedByModelId[item.modelId].provider,
            apiModelName: hostedByModelId[item.modelId].apiModelName,
          }
        : null,
      trainingRunId: trainingByModelId[item.modelId]?.trainingRunId ?? null,
      benchmarkRunCount: countByTarget[item.modelId] ?? 0,
    })),
  });
}
