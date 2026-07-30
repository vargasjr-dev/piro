import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../../data/db";
import { trainingRun } from "../../../../../../../data/schema";
import { resolveRequestAuth } from "~/lib/request-auth";
import { isTrainingRunCancellable } from "~/lib/training-run-admin";
import {
  reconcileStaleTrainingRun,
  serializeTrainingRun,
} from "~/lib/training-runs.server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveRequestAuth(request);
  if (!auth?.isAdmin) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const [found] = await db
    .select()
    .from(trainingRun)
    .where(eq(trainingRun.id, id))
    .limit(1);
  if (!found) {
    return Response.json({ error: "Training run not found" }, { status: 404 });
  }

  const run = await reconcileStaleTrainingRun(found);
  if (!isTrainingRunCancellable(run)) {
    return Response.json(
      {
        error: `Training run is already ${run.status}`,
        run: serializeTrainingRun(run),
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const [cancelled] = await db
    .update(trainingRun)
    .set({
      status: "cancelled",
      error: "Cancelled by admin.",
      completedAt: now,
      heartbeatAt: now,
    })
    .where(
      and(
        eq(trainingRun.id, id),
        inArray(trainingRun.status, ["queued", "running"]),
      ),
    )
    .returning();

  if (!cancelled) {
    const [current] = await db
      .select()
      .from(trainingRun)
      .where(eq(trainingRun.id, id))
      .limit(1);
    return Response.json(
      {
        error: "Training run changed state before it could be cancelled",
        run: current ? serializeTrainingRun(current) : null,
      },
      { status: 409 },
    );
  }

  return Response.json({ run: serializeTrainingRun(cancelled) });
}
