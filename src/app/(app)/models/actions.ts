"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
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
