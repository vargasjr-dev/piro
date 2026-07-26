import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { getSubscription, isActive } from "~/lib/billing";
import { model } from "../../../../../data/schema";
import { db } from "../../../../../data/db";
import { eq } from "drizzle-orm";
import { createSuggestedModelId } from "~/lib/model-id-suggestion";

export async function GET() {
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

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const modelId = createSuggestedModelId();
    const [existing] = await db
      .select({ id: model.id })
      .from(model)
      .where(eq(model.id, modelId))
      .limit(1);

    if (!existing) return Response.json({ modelId });
  }

  return Response.json(
    { error: "Could not find an available model ID. Please try again." },
    { status: 503 },
  );
}
