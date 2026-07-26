import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
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
import { invokeModalInference, ModalInferenceError } from "../../../_lib/modal";

export const runtime = "nodejs";
export const maxDuration = 60;

const browserInferenceSchema = piroInputSchema.extend({
  state: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [modelRow] = await db
    .select({
      deploymentId: deployment.id,
      modelId: model.id,
      userId: model.userId,
      inferenceEndpoint: model.inferenceEndpoint,
      weightsR2Key: model.weightsR2Key,
    })
    .from(deployment)
    .innerJoin(model, eq(deployment.modelId, model.id))
    .where(
      and(
        isNull(model.archivedAt),
        eq(deployment.id, id),
        eq(deployment.enabled, true),
        or(
          and(
            eq(deployment.isAdmin, false),
            eq(deployment.createdByUserId, session.user.id),
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

  if (!modelRow) {
    return Response.json({ error: "Deployment not found" }, { status: 404 });
  }

  if (!modelRow.inferenceEndpoint || !modelRow.weightsR2Key) {
    return Response.json(
      { error: "This deployment is not ready for inference yet." },
      { status: 409 },
    );
  }

  const [trainingLink] = await db
    .select({ trainingRunId: modelTrainingRun.trainingRunId })
    .from(modelTrainingRun)
    .where(eq(modelTrainingRun.modelId, modelRow.modelId))
    .limit(1);
  const [run] = trainingLink
    ? await db
        .select({ architecturePath: trainingRun.architecturePath })
        .from(trainingRun)
        .where(eq(trainingRun.id, trainingLink.trainingRunId))
        .limit(1)
    : [];

  const architecture = run?.architecturePath
    ? architectureFromPath(run.architecturePath)
    : null;
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
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = browserInferenceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid PiroInput", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const result = await invokeModalInference(
      modelRow.inferenceEndpoint,
      modelRow.deploymentId,
      architecture,
      { parts: parsed.data.parts },
      process.env.MODAL_WEBHOOK_SECRET ?? "",
      parsed.data.state ?? null,
    );

    return Response.json({
      output: modalTextToPiroOutput(result.text),
      durationMs: result.durationMs,
      state: result.state,
    });
  } catch (error) {
    if (error instanceof ModalInferenceError) {
      return Response.json(
        { error: "Model inference failed" },
        { status: 502 },
      );
    }

    return Response.json({ error: "Model inference failed" }, { status: 502 });
  }
}
