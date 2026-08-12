import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../data/db";
import {
  deployment,
  model,
  modelTrainingRun,
  trainingRun,
} from "../../../../../../data/schema";
import {
  architectureFromPath,
  modalTextToPiroOutput,
  piroInputSchema,
} from "../../../_lib/contracts";
import {
  invokeHostedInference,
  HostedInferenceError,
} from "../../../_lib/hosted";
import { invokeModalInference, ModalInferenceError } from "../../../_lib/modal";
import { elapsedMs, type InferenceTimings } from "../../../_lib/timings";
import { getHostedModel } from "~/lib/hosted-models";
import { PIRO_INFERENCE_ENDPOINT } from "~/lib/inference";

export const runtime = "nodejs";
export const maxDuration = 60;

const browserInferenceSchema = piroInputSchema.extend({
  state: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeStartedAt = performance.now();
  const requestId = crypto.randomUUID();
  const { id } = await params;

  const authStartedAt = performance.now();
  const session = await auth.api.getSession({ headers: await headers() });
  const authMs = elapsedMs(authStartedAt);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modelLookupStartedAt = performance.now();
  const hostedModel = isAdmin(session) ? getHostedModel(id) : undefined;
  const [modelRow] = hostedModel
    ? []
    : await db
        .select({
          id: model.id,
          userId: model.userId,
          weightsR2Key: model.weightsR2Key,
        })
        .from(model)
        .where(and(eq(model.id, id), isNull(model.archivedAt)))
        .limit(1);
  const modelLookupMs = elapsedMs(modelLookupStartedAt);

  if (!hostedModel && !modelRow) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  const deploymentLookupStartedAt = performance.now();
  const [visibleDeployment] = hostedModel
    ? []
    : await db
        .select({ id: deployment.id })
        .from(deployment)
        .innerJoin(model, eq(deployment.modelId, model.id))
        .where(
          and(
            eq(deployment.modelId, id),
            eq(deployment.enabled, true),
            or(
              and(
                eq(deployment.isAdmin, false),
                eq(deployment.createdByUserId, session.user.id),
                eq(model.userId, session.user.id),
              ),
              and(
                eq(deployment.isAdmin, true),
                or(
                  isNull(deployment.targetUserId),
                  eq(deployment.targetUserId, session.user.id),
                ),
              ),
            ),
          ),
        )
        .limit(1);
  const lookupMs = modelLookupMs + elapsedMs(deploymentLookupStartedAt);

  if (!hostedModel && !visibleDeployment) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  const validationStartedAt = performance.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = browserInferenceSchema.safeParse(body);
  const inputValidationMs = elapsedMs(validationStartedAt);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid PiroInput", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const baseTimings: InferenceTimings = {
    requestId,
    authMs,
    modelLookupMs: lookupMs,
    inputValidationMs,
  };

  if (hostedModel) {
    try {
      const result = await invokeHostedInference(hostedModel, {
        parts: parsed.data.parts,
      });
      const timings = {
        ...baseTimings,
        routeMs: elapsedMs(routeStartedAt),
      };
      console.info("[model-infer] completed", {
        requestId,
        modelType: "hosted",
        timings,
      });
      return Response.json({
        output: modalTextToPiroOutput(result.text),
        durationMs: result.durationMs,
        state: null,
        metadata: null,
        timings,
      });
    } catch (error) {
      if (error instanceof HostedInferenceError) {
        return Response.json({ error: error.message }, { status: 502 });
      }
      return Response.json(
        { error: "Hosted model inference failed" },
        { status: 502 },
      );
    }
  }

  if (!modelRow!.weightsR2Key) {
    return Response.json(
      { error: "This model is not ready for inference yet." },
      { status: 409 },
    );
  }

  const architectureLookupStartedAt = performance.now();
  const [trainingLink] = await db
    .select({ trainingRunId: modelTrainingRun.trainingRunId })
    .from(modelTrainingRun)
    .where(eq(modelTrainingRun.modelId, id))
    .limit(1);
  const [run] = trainingLink
    ? await db
        .select({ architecturePath: trainingRun.architecturePath })
        .from(trainingRun)
        .where(eq(trainingRun.id, trainingLink.trainingRunId))
        .limit(1)
    : [];
  const architectureLookupMs = elapsedMs(architectureLookupStartedAt);

  const architecture = architectureFromPath(run?.architecturePath ?? "");
  if (!architecture) {
    return Response.json(
      { error: "Model architecture is not supported for inference" },
      { status: 409 },
    );
  }

  try {
    const result = await invokeModalInference(
      PIRO_INFERENCE_ENDPOINT,
      modelRow!.id,
      architecture,
      { parts: parsed.data.parts },
      process.env.MODAL_WEBHOOK_SECRET ?? "",
      parsed.data.state ?? null,
      fetch,
      requestId,
    );
    const timings = {
      ...baseTimings,
      modelLookupMs: lookupMs + architectureLookupMs,
      ...result.timings,
      routeMs: elapsedMs(routeStartedAt),
    };
    console.info("[model-infer] completed", {
      requestId,
      modelType: "modal",
      architecture,
      timings,
    });

    return Response.json({
      output: modalTextToPiroOutput(result.text),
      durationMs: result.durationMs,
      state: result.state,
      metadata: result.metadata,
      timings,
    });
  } catch (error) {
    if (error instanceof ModalInferenceError) {
      console.error("[model-infer] Modal inference failed", {
        requestId,
        architecture,
        endpointHost: new URL(PIRO_INFERENCE_ENDPOINT).host,
        upstreamStatus: error.upstreamStatus,
        upstreamError: error.message.slice(0, 500),
        timings: {
          ...baseTimings,
          modelLookupMs: lookupMs + architectureLookupMs,
          ...error.performance?.timings,
          modalHttpMs: error.performance?.modalHttpMs,
          routeMs: elapsedMs(routeStartedAt),
        },
      });
      return Response.json(
        { error: "Model inference failed" },
        { status: 502 },
      );
    }

    console.error("[model-infer] Unexpected inference failure", {
      requestId,
      architecture,
      error:
        error instanceof Error ? error.message.slice(0, 500) : String(error),
    });
    return Response.json({ error: "Model inference failed" }, { status: 502 });
  }
}
