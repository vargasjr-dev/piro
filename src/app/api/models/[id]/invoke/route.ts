import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../data/db";
import {
  deployment,
  model,
  modelTrainingRun,
  trainingRun,
} from "../../../../../../data/schema";
import { extractBearer, validateApiKey } from "../../../../../lib/api-auth";
import {
  architectureFromPath,
  modalTextToPiroOutput,
  piroInputSchema,
} from "../../../_lib/contracts";
import { invokeModalInference, ModalInferenceError } from "../../../_lib/modal";
import { elapsedMs, type InferenceTimings } from "../../../_lib/timings";
import { PIRO_INFERENCE_ENDPOINT } from "~/lib/inference";

export const runtime = "nodejs";
export const maxDuration = 60;

const invalidJsonError = { error: "Request body must be valid JSON" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeStartedAt = performance.now();
  const requestId = crypto.randomUUID();

  const authStartedAt = performance.now();
  const auth = await validateApiKey(extractBearer(request) ?? "");
  const authMs = elapsedMs(authStartedAt);
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: modelKey } = await params;
  const modelLookupStartedAt = performance.now();
  const [visibleModel] = await db
    .select({
      id: model.id,
      weightsR2Key: model.weightsR2Key,
      architecturePath: trainingRun.architecturePath,
    })
    .from(model)
    .innerJoin(deployment, eq(deployment.modelId, model.id))
    .leftJoin(modelTrainingRun, eq(modelTrainingRun.modelId, model.id))
    .leftJoin(trainingRun, eq(trainingRun.id, modelTrainingRun.trainingRunId))
    .where(
      and(
        or(eq(model.id, modelKey), eq(model.name, modelKey)),
        isNull(model.archivedAt),
        eq(deployment.enabled, true),
        or(
          and(
            eq(deployment.isAdmin, false),
            eq(deployment.createdByUserId, auth.userId),
            eq(model.userId, auth.userId),
          ),
          and(
            eq(deployment.isAdmin, true),
            or(
              isNull(deployment.targetUserId),
              eq(deployment.targetUserId, auth.userId),
            ),
          ),
        ),
      ),
    )
    .limit(1);
  const modelLookupMs = elapsedMs(modelLookupStartedAt);

  if (!visibleModel) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  if (!visibleModel.weightsR2Key) {
    return Response.json(
      { error: "Model inference is not available" },
      { status: 409 },
    );
  }

  const architecture = architectureFromPath(
    visibleModel.architecturePath ?? "",
  );
  if (!architecture) {
    return Response.json(
      { error: "Model architecture is not supported for inference" },
      { status: 409 },
    );
  }

  const validationStartedAt = performance.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(invalidJsonError, { status: 400 });
  }

  const parsed = piroInputSchema.safeParse(body);
  const inputValidationMs = elapsedMs(validationStartedAt);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid PiroInput",
        issues: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  const baseTimings: InferenceTimings = {
    requestId,
    authMs,
    modelLookupMs,
    inputValidationMs,
  };

  try {
    const result = await invokeModalInference(
      PIRO_INFERENCE_ENDPOINT,
      visibleModel.id,
      architecture,
      parsed.data,
      process.env.MODAL_WEBHOOK_SECRET ?? "",
      null,
      fetch,
      requestId,
    );
    const timings = {
      ...baseTimings,
      ...result.timings,
      routeMs: elapsedMs(routeStartedAt),
    };
    console.info("[model-invoke] completed", {
      requestId,
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
      console.error("[model-invoke] Modal inference failed", {
        requestId,
        modelId: visibleModel.id,
        architecture,
        endpointHost: new URL(PIRO_INFERENCE_ENDPOINT).host,
        upstreamStatus: error.upstreamStatus,
        upstreamError: error.message.slice(0, 500),
        timings: {
          ...baseTimings,
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

    console.error("[model-invoke] Unexpected inference failure", {
      requestId,
      modelId: visibleModel.id,
      architecture,
      error:
        error instanceof Error ? error.message.slice(0, 500) : String(error),
    });

    return Response.json({ error: "Model inference failed" }, { status: 502 });
  }
}
