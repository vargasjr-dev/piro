import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { model, modelHostedApi, modelTrainingRun, trainingRun } from "../../../../../data/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [m] = await db
    .select({ id: model.id })
    .from(model)
    .where(and(eq(model.id, id), eq(model.userId, session.user.id)))
    .limit(1);

  if (!m) return Response.json({ error: "Not found" }, { status: 404 });

  await db
    .update(model)
    .set({ archivedAt: new Date() })
    .where(eq(model.id, id));

  return Response.json({ ok: true });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [m] = await db
    .select()
    .from(model)
    .where(and(eq(model.id, id), eq(model.userId, session.user.id)))
    .limit(1);

  if (!m) return Response.json({ error: "Not found" }, { status: 404 });

  // Try training run link
  const [trainingLink] = await db
    .select()
    .from(modelTrainingRun)
    .where(eq(modelTrainingRun.modelId, id))
    .limit(1);

  let run: typeof trainingRun.$inferSelect | null = null;
  if (trainingLink) {
    const [r] = await db
      .select()
      .from(trainingRun)
      .where(eq(trainingRun.id, trainingLink.trainingRunId))
      .limit(1);
    run = r ?? null;
  }

  // Try hosted API link
  const [hostedApi] = await db
    .select()
    .from(modelHostedApi)
    .where(eq(modelHostedApi.modelId, id))
    .limit(1);

  return Response.json({
    model: {
      id: m.id,
      name: m.name,
      description: m.description,
      parameterCount: m.parameterCount,
      createdAt: m.createdAt.toISOString(),
    },
    trainingRun: run
      ? {
          id: run.id,
          modelTemplate: run.modelTemplate,
          configJson: run.configJson,
          epochs: run.epochs,
          finalTrainLoss: run.finalTrainLoss,
          finalValLoss: run.finalValLoss,
          finalValAccuracy: run.finalValAccuracy,
          epochHistoryJson: run.epochHistoryJson,
          queuedAt: run.queuedAt.toISOString(),
          startedAt: run.startedAt?.toISOString() ?? null,
          completedAt: run.completedAt?.toISOString() ?? null,
        }
      : null,
    hostedApi: hostedApi
      ? {
          provider: hostedApi.provider,
          apiModelName: hostedApi.apiModelName,
        }
      : null,
  });
}
