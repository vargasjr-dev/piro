import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import { db } from "../../data/db";
import { trainingRun } from "../../data/schema";

export async function resolveTrainingRunUserId(
  request: Request,
): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export function serializeTrainingRun(run: typeof trainingRun.$inferSelect) {
  return {
    id: run.id,
    modelName: run.modelName,
    architecturePath: run.architecturePath,
    datasetId: run.datasetId,
    status: run.status,
    epochs: run.epochs,
    configJson: run.configJson,
    finalTrainLoss: run.finalTrainLoss,
    finalValLoss: run.finalValLoss,
    finalValAccuracy: run.finalValAccuracy,
    epochHistoryJson: run.epochHistoryJson,
    currentEpoch: run.currentEpoch,
    error: run.error,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export async function getOwnedTrainingRun(id: string, userId: string) {
  const [run] = await db
    .select()
    .from(trainingRun)
    .where(and(eq(trainingRun.id, id), eq(trainingRun.userId, userId)))
    .limit(1);
  return run ?? null;
}
