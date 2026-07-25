import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../data/db";
import {
  deployment,
  model,
  modelHostedApi,
  user,
} from "../../../../../../data/schema";
import { resolveRequestAuth } from "~/lib/request-auth";

const deploymentRequestSchema = z.object({
  targetUserId: z.string().min(1).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: modelId } = await params;
  const resolvedAuth = await resolveRequestAuth(request);
  if (!resolvedAuth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body creates the caller's private deployment, or an admin's global deployment.
  }

  const parsedBody = deploymentRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { error: "Invalid deployment request" },
      { status: 400 },
    );
  }

  const targetUserId = parsedBody.data.targetUserId ?? null;
  if (targetUserId && !resolvedAuth.isAdmin) {
    return Response.json(
      { error: "Only admins can target deployments to another user" },
      { status: 403 },
    );
  }

  const isAdminDeployment = resolvedAuth.isAdmin;
  const modelConditions = [eq(model.id, modelId), isNull(modelHostedApi.id)];
  if (!isAdminDeployment) {
    modelConditions.push(eq(model.userId, resolvedAuth.userId));
  }

  const [targetModel] = await db
    .select({ id: model.id })
    .from(model)
    .leftJoin(modelHostedApi, eq(modelHostedApi.modelId, model.id))
    .where(and(...modelConditions))
    .limit(1);

  if (!targetModel) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  if (targetUserId) {
    const [targetUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);
    if (!targetUser) {
      return Response.json({ error: "Target user not found" }, { status: 404 });
    }
  }

  const targetCondition = targetUserId
    ? eq(deployment.targetUserId, targetUserId)
    : isNull(deployment.targetUserId);
  const existingConditions = [
    eq(deployment.modelId, modelId),
    eq(deployment.isAdmin, isAdminDeployment),
    targetCondition,
  ];
  if (!isAdminDeployment) {
    existingConditions.push(
      eq(deployment.createdByUserId, resolvedAuth.userId),
    );
  }

  const [existing] = await db
    .select()
    .from(deployment)
    .where(and(...existingConditions))
    .limit(1);

  if (existing) {
    return Response.json({ deployment: existing, created: false });
  }

  const [created] = await db
    .insert(deployment)
    .values({
      id: randomUUID(),
      modelId,
      createdByUserId: resolvedAuth.userId,
      isAdmin: isAdminDeployment,
      targetUserId: isAdminDeployment ? targetUserId : null,
      enabled: true,
    })
    .returning();

  return Response.json({ deployment: created, created: true }, { status: 201 });
}
