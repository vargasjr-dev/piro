import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { trainingRun } from "../../../../data/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

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
      currentEpoch: r.currentEpoch,
      error: r.error,
      queuedAt: r.queuedAt.toISOString(),
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
}

// ── POST /api/training-runs ───────────────────────────────────────────────────

interface CreateBody {
  modelTemplate: string;
  dataSource: string;
  epochs?: number;
  modelName?: string;
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

  const { modelTemplate, dataSource, epochs = 10, modelName } = body;

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

  await db.insert(trainingRun).values({
    id,
    userId: session.user.id,
    modelName: modelName?.trim() || null,
    modelTemplate,
    dataSource,
    status: "queued",
    epochs,
    configJson,
  });

  // ── Trigger Modal training worker ─────────────────────────────────────────
  // Modal's web endpoint spawns async and returns 200 immediately, so this
  // await is fast (< 500 ms). If MODAL_TRAINING_ENDPOINT is not set the run
  // stays "queued" and can be re-triggered once Modal is deployed.
  const modalEndpoint = process.env.MODAL_TRAINING_ENDPOINT;
  if (modalEndpoint) {
    try {
      const res = await fetch(modalEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: id,
          modelName: modelName?.trim() || null,
          modelTemplate,
          dataSource,
          epochs,
          seed: 42,
          secret: process.env.MODAL_WEBHOOK_SECRET ?? "",
        }),
      });
      if (!res.ok) {
        console.error(`[training] Modal trigger returned ${res.status}`);
      }
    } catch (err) {
      console.error("[training] Modal trigger failed:", err);
    }
  } else {
    console.warn("[training] MODAL_TRAINING_ENDPOINT not set — run will stay queued");
  }

  return Response.json({ id }, { status: 201 });
}
