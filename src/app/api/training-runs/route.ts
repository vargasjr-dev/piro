import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { trainingRun } from "../../../../data/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runTraining } from "~/lib/training/runner";

// ── GET /api/training-runs ────────────────────────────────────────────────────

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const runs = await db
    .select()
    .from(trainingRun)
    .where(eq(trainingRun.userId, session.user.id))
    .orderBy(desc(trainingRun.queuedAt))
    .limit(50);

  return Response.json({
    runs: runs.map((r) => ({
      id: r.id,
      modelTemplate: r.modelTemplate,
      dataSource: r.dataSource,
      status: r.status,
      epochs: r.epochs,
      configJson: r.configJson,
      finalTrainLoss: r.finalTrainLoss,
      finalValLoss: r.finalValLoss,
      finalValAccuracy: r.finalValAccuracy,
      epochHistoryJson: r.epochHistoryJson,
      error: r.error,
      queuedAt: r.queuedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
}

// ── POST /api/training-runs ───────────────────────────────────────────────────

interface CreateBody {
  modelTemplate: string;
  dataSource: string;
  epochs?: number;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { modelTemplate, dataSource, epochs = 10 } = body;

  if (!modelTemplate || !dataSource) {
    return Response.json({ error: "modelTemplate and dataSource are required" }, { status: 400 });
  }

  const validTemplates = ["ctm", "baseline-transformer"];
  if (!validTemplates.includes(modelTemplate)) {
    return Response.json(
      { error: `modelTemplate must be one of: ${validTemplates.join(", ")}` },
      { status: 400 },
    );
  }

  const validSources = ["sorting-sequences"];
  if (!validSources.includes(dataSource)) {
    return Response.json(
      { error: `dataSource must be one of: ${validSources.join(", ")}` },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const configJson = JSON.stringify({ modelTemplate, dataSource, epochs });

  // Insert as "running" immediately — execution happens synchronously below
  await db.insert(trainingRun).values({
    id,
    userId: session.user.id,
    modelTemplate,
    dataSource,
    status: "running",
    epochs,
    configJson,
  });

  // ── Run training in-process ───────────────────────────────────────────────
  try {
    const result = runTraining({ modelTemplate, dataSource, epochs });

    await db
      .update(trainingRun)
      .set({
        status: "complete",
        finalTrainLoss: result.finalTrainLoss,
        finalValLoss: result.finalValLoss,
        finalValAccuracy: result.finalValAccuracy,
        epochHistoryJson: JSON.stringify(result.epochHistory),
        completedAt: new Date(),
      })
      .where(eq(trainingRun.id, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(trainingRun)
      .set({
        status: "error",
        error: message,
        completedAt: new Date(),
      })
      .where(eq(trainingRun.id, id));
  }

  return Response.json({ id }, { status: 201 });
}
