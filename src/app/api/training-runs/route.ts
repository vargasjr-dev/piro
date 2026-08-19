import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import {
  trainingRun,
  dataset,
  subscription,
  user,
} from "../../../../data/schema";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import {
  reconcileStaleTrainingRun,
  resolveTrainingRunUserId,
  serializeTrainingRun,
} from "~/lib/training-runs.server";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getSubscription,
  isActive,
  hasTrainingRunsRemaining,
} from "~/lib/billing";
import { isAdmin } from "~/lib/admin";
import { trainingRunEvent } from "~/lib/training-run-events";
import { insertTrainingRunEvent } from "~/lib/training-run-events.server";
import { parseModalDispatchResponse } from "~/lib/training-dispatch.server";

// ── GET /api/training-runs ────────────────────────────────────────────────────

export async function GET(request: Request) {
  const userId = await resolveTrainingRunUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const runs = await db
    .select()
    .from(trainingRun)
    .where(eq(trainingRun.userId, userId))
    .orderBy(desc(trainingRun.queuedAt))
    .limit(50);

  const reconciled = await Promise.all(runs.map(reconcileStaleTrainingRun));
  return Response.json({
    runs: reconciled.map((run) => serializeTrainingRun(run)),
  });
}

// ── POST /api/training-runs ───────────────────────────────────────────────────

interface CreateBody {
  architecturePath: string;
  datasetId: string;
  maxSteps?: number;
  modelName?: string;
  debug?: boolean;
}

async function resolveAuth(
  request: Request,
): Promise<{ userId: string; isAdmin: boolean } | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) {
      const [account] = await db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, keyAuth.userId))
        .limit(1);
      return { userId: keyAuth.userId, isAdmin: account?.role === "admin" };
    }
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { userId: session.user.id, isAdmin: isAdmin(session) };
}

export async function POST(request: Request) {
  const resolvedAuth = await resolveAuth(request);
  if (!resolvedAuth)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── Subscription + quota check ────────────────────────────────────────────
  const adminBypass = resolvedAuth.isAdmin;
  const sub = await getSubscription(resolvedAuth.userId);
  if (!isActive(sub) && !adminBypass) {
    return Response.json(
      { error: "Active subscription required to start a training run" },
      { status: 402 },
    );
  }
  if (!adminBypass && !hasTrainingRunsRemaining(sub)) {
    return Response.json(
      {
        error: `Training run quota reached (${sub!.trainingRunsUsed}/${sub!.trainingRunsLimit} this period). Upgrade or wait until your next billing period.`,
      },
      { status: 429 },
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    architecturePath,
    datasetId,
    maxSteps = 5000,
    modelName,
    debug = false,
  } = body;

  if (!architecturePath || !datasetId) {
    return Response.json(
      { error: "architecturePath and datasetId are required" },
      { status: 400 },
    );
  }

  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1_000_000) {
    return Response.json(
      { error: "maxSteps must be an integer between 1 and 1,000,000" },
      { status: 400 },
    );
  }
  if (typeof debug !== "boolean") {
    return Response.json({ error: "debug must be a boolean" }, { status: 400 });
  }

  // Verify the dataset belongs to the user
  const [ds] = await db
    .select()
    .from(dataset)
    .where(
      and(eq(dataset.id, datasetId), eq(dataset.userId, resolvedAuth.userId)),
    )
    .limit(1);

  if (!ds) {
    return Response.json({ error: "Dataset not found" }, { status: 404 });
  }

  const id = randomUUID();
  const configJson = JSON.stringify({
    architecturePath,
    datasetId,
    maxSteps,
    debug,
  });
  const createdEvent = trainingRunEvent("run_created");

  await db.insert(trainingRun).values({
    id,
    userId: resolvedAuth.userId,
    modelName: modelName?.trim() || null,
    architecturePath,
    datasetId,
    status: "queued",
    maxSteps,
    configJson,
  });
  await insertTrainingRunEvent(id, createdEvent);

  // Increment the quota counter atomically
  if (!adminBypass) {
    await db
      .update(subscription)
      .set({
        trainingRunsUsed: sql`${subscription.trainingRunsUsed} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(subscription.userId, resolvedAuth.userId));
  }

  // ── Trigger Modal training worker ─────────────────────────────────────────
  const modalEndpoint = process.env.MODAL_TRAINING_ENDPOINT;
  let dispatchError: string | null = null;
  let modalFunctionCallId: string | null = null;
  const dispatchStartedEvent = trainingRunEvent("dispatch_started");
  await insertTrainingRunEvent(id, dispatchStartedEvent);
  if (!modalEndpoint) {
    dispatchError = "MODAL_TRAINING_ENDPOINT is not configured.";
  } else {
    try {
      const res = await fetch(modalEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: id,
          modelName: modelName?.trim() || null,
          architecturePath,
          sourcePath: ds.sourcePath,
          datasetR2Prefix: ds.r2Prefix,
          maxSteps,
          seed: 42,
          debug,
          secret: process.env.MODAL_WEBHOOK_SECRET ?? "",
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const dispatch = await parseModalDispatchResponse(res);
      modalFunctionCallId = dispatch.functionCallId;
      const [tracked] = await db
        .update(trainingRun)
        .set({ modalFunctionCallId })
        .where(and(eq(trainingRun.id, id), eq(trainingRun.status, "queued")))
        .returning({ id: trainingRun.id });
      if (!tracked) {
        throw new Error(
          "Training run changed before its Modal dispatch could be tracked.",
        );
      }
    } catch (err) {
      dispatchError =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Modal trigger timed out after 30 seconds."
          : `Modal trigger failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (dispatchError) {
    console.error(`[training] ${dispatchError}`);
    await db
      .update(trainingRun)
      .set({
        status: "error",
        error: dispatchError,
        modalFunctionCallId,
        completedAt: new Date(),
      })
      .where(and(eq(trainingRun.id, id), eq(trainingRun.status, "queued")));
    await insertTrainingRunEvent(
      id,
      trainingRunEvent("dispatch_failed", {
        error: dispatchError.slice(0, 500),
        functionCallId: modalFunctionCallId,
      }),
    );

    if (!adminBypass) {
      await db
        .update(subscription)
        .set({
          trainingRunsUsed: sql`GREATEST(${subscription.trainingRunsUsed} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(subscription.userId, resolvedAuth.userId));
    }
    return Response.json({ error: dispatchError, id }, { status: 503 });
  }

  await insertTrainingRunEvent(
    id,
    trainingRunEvent("dispatch_succeeded", {
      functionCallId: modalFunctionCallId,
    }),
  );

  return Response.json(
    { id, functionCallId: modalFunctionCallId },
    { status: 201 },
  );
}
