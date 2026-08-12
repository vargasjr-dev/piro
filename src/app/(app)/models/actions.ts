"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { requireAdmin } from "~/lib/admin";
import { db } from "../../../../data/db";
import { deployment, model } from "../../../../data/schema";

export async function disablePrivateDeployment(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const deploymentId = formData.get("deploymentId");
  if (typeof deploymentId !== "string" || deploymentId.length === 0) {
    throw new Error("Invalid deployment");
  }

  const [ownedDeployment] = await db
    .select({ id: deployment.id })
    .from(deployment)
    .innerJoin(model, eq(model.id, deployment.modelId))
    .where(
      and(
        eq(deployment.id, deploymentId),
        eq(deployment.isAdmin, false),
        eq(deployment.createdByUserId, session.user.id),
        eq(model.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!ownedDeployment) throw new Error("Deployment not found");

  await db
    .update(deployment)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(deployment.id, ownedDeployment.id));

  revalidatePath("/models");
  revalidatePath("/admin/deployments");
  redirect("/models");
}

async function getGlobalDeployment(deploymentId: string) {
  const [globalDeployment] = await db
    .select({ id: deployment.id, modelName: model.name })
    .from(deployment)
    .innerJoin(model, eq(model.id, deployment.modelId))
    .where(
      and(
        eq(deployment.id, deploymentId),
        eq(deployment.isAdmin, true),
        isNull(deployment.targetUserId),
      ),
    )
    .limit(1);

  return globalDeployment;
}

export async function disableGlobalDeployment(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  requireAdmin(session);

  const deploymentId = formData.get("deploymentId");
  if (typeof deploymentId !== "string" || deploymentId.length === 0) {
    throw new Error("Invalid deployment");
  }

  const globalDeployment = await getGlobalDeployment(deploymentId);
  if (!globalDeployment) throw new Error("Global deployment not found");

  await db
    .update(deployment)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(deployment.id, globalDeployment.id));

  revalidatePath("/models");
  revalidatePath(`/models/${encodeURIComponent(globalDeployment.modelName)}`);
  revalidatePath("/admin/deployments");
  redirect(`/models/${encodeURIComponent(globalDeployment.modelName)}`);
}

export async function deleteGlobalDeployment(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  requireAdmin(session);

  const deploymentId = formData.get("deploymentId");
  if (typeof deploymentId !== "string" || deploymentId.length === 0) {
    throw new Error("Invalid deployment");
  }

  const globalDeployment = await getGlobalDeployment(deploymentId);
  if (!globalDeployment) throw new Error("Global deployment not found");

  await db.delete(deployment).where(eq(deployment.id, globalDeployment.id));

  revalidatePath("/models");
  revalidatePath(`/models/${encodeURIComponent(globalDeployment.modelName)}`);
  revalidatePath("/admin/deployments");
  redirect("/models");
}
