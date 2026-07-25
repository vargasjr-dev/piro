import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../data/db";
import { model } from "../../../../../../data/schema";
import { extractBearer, validateApiKey } from "../../../../../lib/api-auth";
import {
  modalTextToPiroOutput,
  piroInputSchema,
} from "../../../_lib/contracts";
import {
  invokeModalInference,
  ModalInferenceError,
} from "../../../_lib/modal";

export const runtime = "nodejs";
export const maxDuration = 60;

const invalidJsonError = { error: "Request body must be valid JSON" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ model: string }> },
) {
  const auth = await validateApiKey(extractBearer(request) ?? "");
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { model: modelId } = await params;
  const [modelRow] = await db
    .select({ id: model.id, inferenceEndpoint: model.inferenceEndpoint })
    .from(model)
    .where(and(eq(model.id, modelId), eq(model.userId, auth.userId)))
    .limit(1);

  if (!modelRow) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  if (!modelRow.inferenceEndpoint) {
    return Response.json(
      { error: "Model inference is not available" },
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
      modelRow.inferenceEndpoint,
      modelRow.id,
      parsed.data,
      process.env.MODAL_WEBHOOK_SECRET ?? "",
    );

    return Response.json({ output: modalTextToPiroOutput(result.text) });
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
