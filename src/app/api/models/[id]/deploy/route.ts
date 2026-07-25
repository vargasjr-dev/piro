import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { deployment, model } from "../../../../../../data/schema";
import { resolveRequestAuth } from "~/lib/request-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: modelId } = await params;
  const resolvedAuth = await resolveRequestAuth(request);
  if (!resolvedAuth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdminDeployment = resolvedAuth.isAdmin;
  const modelConditions = [eq(model.id, modelId)];
  if (!isAdminDeployment) {
    modelConditions.push(eq(model.userId, resolvedAuth.userId));
  }

  const [targetModel] = await db
    .select({ id: model.id })
    .from(model)
    .where(and(...modelConditions))
    .limit(1);

  if (!targetModel) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(deployment)
    .where(
      and(
        eq(deployment.modelId, modelId),
        eq(deployment.createdByUserId, resolvedAuth.userId),
        eq(deployment.isAdmin, isAdminDeployment),
      ),
    )
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
      enabled: true,
    })
    .returning();

  return Response.json({ deployment: created, created: true }, { status: 201 });
}
