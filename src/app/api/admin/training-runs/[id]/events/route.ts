import { eq } from "drizzle-orm";
import { db } from "../../../../../../../data/db";
import { trainingRun } from "../../../../../../../data/schema";
import { resolveRequestAuth } from "~/lib/request-auth";
import { getTrainingRunEventPage } from "~/lib/training-run-events.server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveRequestAuth(request);
  if (!auth?.isAdmin) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const [run] = await db
    .select()
    .from(trainingRun)
    .where(eq(trainingRun.id, id))
    .limit(1);
  if (!run) {
    return Response.json({ error: "Training run not found" }, { status: 404 });
  }

  const paramsUrl = new URL(request.url).searchParams;
  const parsedOffset = Number(paramsUrl.get("offset") ?? "0");
  const offset = Number.isFinite(parsedOffset) ? parsedOffset : 0;
  const page = await getTrainingRunEventPage(
    run.id,
    offset,
    run,
    run.workerEventLogJson,
  );

  return Response.json({ runId: run.id, ...page });
}
