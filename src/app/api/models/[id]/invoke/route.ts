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

export const runtime = "nodejs";
export const maxDuration = 60;

const invalidJsonError = { error: "Request body must be valid JSON" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(extractBearer(request) ?? "");
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: modelKey } = await params;
  const [visibleModel] = await db
    .select({
      id: model.id,
      inferenceEndpoint: model.inferenceEndpoint,
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

  if (!visibleModel) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  if (!visibleModel.inferenceEndpoint || !visibleModel.weightsR2Key) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(invalidJsonError, { status: 400 });
  }

  const parsed = piroInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid PiroInput",
        issues: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  try {
    const result = await invokeModalInference(
      visibleModel.inferenceEndpoint,
      visibleModel.id,
      architecture,
      parsed.data,
      process.env.MODAL_WEBHOOK_SECRET ?? "",
    );

    return Response.json({
      output: modalTextToPiroOutput(result.text),
      durationMs: result.durationMs,
      state: result.state,
      metadata: result.metadata,
    });
  } catch (error) {
    if (error instanceof ModalInferenceError) {
      let endpointHost = "unknown";
      try {
        endpointHost = new URL(visibleModel.inferenceEndpoint).host;
      } catch {
        // Keep diagnostics safe if the persisted endpoint is malformed.
      }

      console.error("[model-invoke] Modal inference failed", {
        modelId: visibleModel.id,
        architecture,
        endpointHost,
        upstreamStatus: error.upstreamStatus,
        upstreamError: error.message.slice(0, 500),
      });

      return Response.json(
        { error: "Model inference failed" },
        { status: 502 },
      );
    }

    console.error("[model-invoke] Unexpected inference failure", {
      modelId: visibleModel.id,
      architecture,
      error:
        error instanceof Error ? error.message.slice(0, 500) : String(error),
    });

    return Response.json({ error: "Model inference failed" }, { status: 502 });
  }
}
