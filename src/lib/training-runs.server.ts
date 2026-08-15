import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import { db } from "../../data/db";
import { trainingRun } from "../../data/schema";
import { deriveTrainingRunMetrics } from "./training-run-metrics";
import { exposeTrainingRunEvents } from "./training-run-events";

export { reconcileStaleTrainingRun } from "./training-run-observability.server";

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

export function serializeTrainingRun(
  run: typeof trainingRun.$inferSelect,
  now = new Date(),
) {
  const liveMetrics = deriveTrainingRunMetrics(run, now);
  const workerEventExposure = exposeTrainingRunEvents(run.workerEventLogJson, run);
  return {
    id: run.id,
    modelName: run.modelName,
    architecturePath: run.architecturePath,
    datasetId: run.datasetId,
    status: run.status,
    maxSteps: run.maxSteps,
    configJson: run.configJson,
    finalTrainLoss: run.finalTrainLoss,
    finalValLoss: run.finalValLoss,
    finalValAccuracy: run.finalValAccuracy,
    stepHistoryJson: run.stepHistoryJson,
    ...liveMetrics,
    error: run.error,
    workerDiagnosticsJson: run.workerDiagnosticsJson,
    failureDetailsJson: run.failureDetailsJson,
    workerEventLogJson: run.workerEventLogJson,
    ...workerEventExposure,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    timeoutAt: run.timeoutAt?.toISOString() ?? null,
    runtimeMs: run.runtimeMs,
    costUsd: run.costUsd,
    costBasis: run.costBasis,
    resourceType: run.resourceType,
    gpuType: run.gpuType,
    cpuCores: run.cpuCores,
    memoryMb: run.memoryMb,
    checkpointR2Key: run.checkpointR2Key,
    checkpointStep: run.checkpointStep,
    checkpointAt: run.checkpointAt?.toISOString() ?? null,
    resumeAttempts: run.resumeAttempts,
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
