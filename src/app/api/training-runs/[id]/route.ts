import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { trainingRun } from "../../../../../data/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [run] = await db
    .select()
    .from(trainingRun)
    .where(and(eq(trainingRun.id, id), eq(trainingRun.userId, session.user.id)))
    .limit(1);

  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    run: {
      id: run.id,
      modelTemplate: run.modelTemplate,
      dataSource: run.dataSource,
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
    },
  });
}
