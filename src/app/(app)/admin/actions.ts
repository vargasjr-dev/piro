"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auth } from "~/lib/auth.server";
import { requireAdmin } from "~/lib/admin";
import { db } from "../../../../data/db";
import {
  deployment,
  model,
  modelHostedApi,
  user,
} from "../../../../data/schema";

const deploymentFormSchema = z.object({
  modelId: z.string().min(1),
  targetUserId: z.string().optional(),
});

export async function createAdminDeployment(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  requireAdmin(session);

  const parsed = deploymentFormSchema.safeParse({
    modelId: formData.get("modelId"),
    targetUserId: formData.get("targetUserId") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid deployment request");

  const targetUserId = parsed.data.targetUserId ?? null;
  const [targetModel] = await db
    .select({ id: model.id })
    .from(model)
    .leftJoin(modelHostedApi, eq(modelHostedApi.modelId, model.id))
    .where(and(eq(model.id, parsed.data.modelId), isNull(modelHostedApi.id)))
    .limit(1);
  if (!targetModel) throw new Error("Model not found or externally hosted");

  if (targetUserId) {
    const [targetUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);
    if (!targetUser) throw new Error("Target user not found");
  }

  const targetCondition = targetUserId
    ? eq(deployment.targetUserId, targetUserId)
    : isNull(deployment.targetUserId);
  const [existing] = await db
    .select({ id: deployment.id })
    .from(deployment)
    .where(
      and(
        eq(deployment.modelId, parsed.data.modelId),
        eq(deployment.isAdmin, true),
        targetCondition,
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(deployment).values({
      id: randomUUID(),
      modelId: parsed.data.modelId,
      createdByUserId: session.user.id,
      isAdmin: true,
      targetUserId,
      enabled: true,
    });
  }

  revalidatePath("/admin/models");
  revalidatePath("/admin/deployments");
  revalidatePath("/models");
}

export async function setDeploymentEnabled(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  requireAdmin(session);

  const deploymentId = formData.get("deploymentId");
  const enabledValue = formData.get("enabled");

  if (typeof deploymentId !== "string" || typeof enabledValue !== "string") {
    throw new Error("Invalid deployment update");
  }

  if (enabledValue !== "true" && enabledValue !== "false") {
    throw new Error("Invalid deployment enabled state");
  }

  await db
    .update(deployment)
    .set({
      enabled: enabledValue === "true",
      updatedAt: new Date(),
    })
    .where(and(eq(deployment.id, deploymentId), eq(deployment.isAdmin, true)));

  revalidatePath("/admin/deployments");
  revalidatePath("/models");
}
