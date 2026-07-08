import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { trainingRun, dataset, subscription } from "../../../../data/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getSubscription, isActive, hasTrainingRunsRemaining } from "~/lib/billing";
import { isAdmin } from "~/lib/admin";

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
      architecturePath: r.architecturePath,
      datasetId: r.datasetId,
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
  architecturePath: string;
  datasetId: string;
  epochs?: number;
  modelName?: string;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── Subscription + quota check ────────────────────────────────────────────
  const adminBypass = isAdmin(session);
  const sub = await getSubscription(session.user.id);
  if (!isActive(sub) && !adminBypass) {
    return Response.json(
      { error: "Active subscription required to start a training run" },
      { status: 402 }
    );
  }
  if (!adminBypass && !hasTrainingRunsRemaining(sub)) {
    return Response.json(
      {
        error: `Training run quota reached (${sub!.trainingRunsUsed}/${sub!.trainingRunsLimit} this period). Upgrade or wait until your next billing period.`,
      },
      { status: 429 }
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { architecturePath, datasetId, epochs = 10, modelName } = body;

  if (!architecturePath || !datasetId) {
    return Response.json({ error: "architecturePath and datasetId are required" }, { status: 400 });
  }

  // Verify the dataset belongs to the user
  const [ds] = await db
    .select()
    .from(dataset)
    .where(and(eq(dataset.id, datasetId), eq(dataset.userId, session.user.id)))
    .limit(1);

  if (!ds) {
    return Response.json({ error: "Dataset not found" }, { status: 404 });
  }

  const id = randomUUID();
  const configJson = JSON.stringify({ architecturePath, datasetId, epochs });

  await db.insert(trainingRun).values({
    id,
    userId: session.user.id,
    repositoryId: ds.repositoryId,
    modelName: modelName?.trim() || null,
    architecturePath,
    datasetId,
    status: "queued",
    epochs,
    configJson,
  });

  // Increment the quota counter atomically
  if (!adminBypass) {
    await db
      .update(subscription)
      .set({
        trainingRunsUsed: sql`${subscription.trainingRunsUsed} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(subscription.userId, session.user.id));
  }

  // ── Trigger Modal training worker ─────────────────────────────────────────
  const modalEndpoint = process.env.MODAL_TRAINING_ENDPOINT;
  if (modalEndpoint) {
    try {
      const res = await fetch(modalEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: id,
          modelName: modelName?.trim() || null,
          architecturePath,
          datasetR2Prefix: ds.r2Prefix,
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
