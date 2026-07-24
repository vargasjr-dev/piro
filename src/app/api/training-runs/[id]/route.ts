import {
  getOwnedTrainingRun,
  resolveTrainingRunUserId,
  serializeTrainingRun,
} from "~/lib/training-runs.server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveTrainingRunUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const run = await getOwnedTrainingRun(id, userId);
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ run: serializeTrainingRun(run) });
}
