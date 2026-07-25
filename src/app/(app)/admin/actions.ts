"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { requireAdmin } from "~/lib/admin";
import { db } from "../../../../data/db";
import { deployment } from "../../../../data/schema";

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
