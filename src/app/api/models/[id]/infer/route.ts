import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { model } from "../../../../../../data/schema";
import { eq, and } from "drizzle-orm";

// ── POST /api/models/[id]/infer ──────────────────────────────────────────────
// Proxies a prompt to the model's Modal inference endpoint.
// The Modal webhook secret stays server-side — never leaks to the client.

interface ModalInferResponse {
  text: string;
  durationMs: number;
  error?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up model — must belong to the user
  const [m] = await db
    .select({
      id: model.id,
      inferenceEndpoint: model.inferenceEndpoint,
      name: model.name,
    })
    .from(model)
    .where(and(eq(model.id, id), eq(model.userId, session.user.id)))
    .limit(1);

  if (!m) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  if (!m.inferenceEndpoint) {
    return Response.json(
      { error: "This model does not have inference enabled. Retrain to enable." },
      { status: 400 },
    );
  }

  // Parse request
  const body = await request.json();
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Call Modal inference
  const secret = process.env.MODAL_WEBHOOK_SECRET ?? "";

  const startTime = performance.now();
  let res: Response;
  try {
    res = await fetch(m.inferenceEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: id, prompt, secret }),
      signal: AbortSignal.timeout(30_000), // 30s timeout
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Inference request failed: ${message}` },
      { status: 502 },
    );
  }
  const totalMs = Math.round(performance.now() - startTime);

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    return Response.json(
      { error: `Modal inference error (${res.status}): ${errorText}` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as ModalInferResponse;

  if (data.error) {
    return Response.json(
      { error: `Model inference error: ${data.error}` },
      { status: 500 },
    );
  }

  return Response.json({
    text: data.text ?? "",
    durationMs: data.durationMs ?? totalMs,
  });
}
