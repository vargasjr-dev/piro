import { eq } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { dataset, generationRun } from "../../../../../data/schema";

const STATUSES = new Set(["queued", "running", "complete", "error"]);

type UpdateBody = {
  status?: string;
  costUsd?: number | null;
  error?: string | null;
  sampleCount?: number | null;
  generatedAt?: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
  if (
    !expectedSecret ||
    request.headers.get("X-Piro-Secret") !== expectedSecret
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body || (body.status && !STATUSES.has(body.status))) {
    return Response.json(
      { error: "Invalid generation run update" },
      { status: 400 },
    );
  }

  const [run] = await db
    .select({ id: generationRun.id, datasetId: generationRun.datasetId })
    .from(generationRun)
    .where(eq(generationRun.id, id))
    .limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const now = new Date();
  const status = body.status;
  const runUpdate: Partial<typeof generationRun.$inferInsert> = {};
  if (status) runUpdate.status = status;
  if (body.costUsd !== undefined) runUpdate.costUsd = body.costUsd;
  if (body.error !== undefined) runUpdate.error = body.error;
  if (status === "running") runUpdate.startedAt = now;
  if (status === "complete" || status === "error") runUpdate.completedAt = now;

  if (Object.keys(runUpdate).length > 0) {
    await db
      .update(generationRun)
      .set(runUpdate)
      .where(eq(generationRun.id, id));
  }

  const datasetUpdate: Partial<typeof dataset.$inferInsert> = {};
  if (body.sampleCount !== undefined)
    datasetUpdate.sampleCount = body.sampleCount;
  if (body.generatedAt !== undefined) {
    datasetUpdate.generatedAt = body.generatedAt
      ? new Date(body.generatedAt)
      : null;
  } else if (status === "complete") {
    datasetUpdate.generatedAt = now;
  }
  if (Object.keys(datasetUpdate).length > 0 && run.datasetId) {
    datasetUpdate.updatedAt = now;
    await db
      .update(dataset)
      .set(datasetUpdate)
      .where(eq(dataset.id, run.datasetId));
  }

  return Response.json({ ok: true });
}
