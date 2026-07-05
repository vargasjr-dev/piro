import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { benchmark, benchmarkSuiteRun, benchmarkRun, model } from "../../../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

/**
 * POST /api/benchmarks/[id]/run
 *
 * Triggers a benchmark run against a target model. Creates a suite run
 * record and returns 202 with the suiteRunId. The actual eval execution
 * is handled by the training/eval pipeline (Modal).
 *
 * Body: { modelId?: string }
 *   modelId — which trained model to evaluate. If omitted, uses the most
 *             recently created model for the user.
 *
 * Accepts session cookie or Bearer API key.
 */

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the benchmark exists and belongs to the user
  const [bm] = await db
    .select()
    .from(benchmark)
    .where(and(eq(benchmark.id, id), eq(benchmark.userId, userId)))
    .limit(1);

  if (!bm) return Response.json({ error: "Benchmark not found" }, { status: 404 });

  // Parse body for optional modelId
  let body: { modelId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — we'll pick the most recent model
  }

  // Resolve the target model
  let targetModelId: string | null = null;
  let targetModelName: string | null = null;

  if (body.modelId) {
    const [m] = await db
      .select({ id: model.id, name: model.name })
      .from(model)
      .where(and(eq(model.id, body.modelId), eq(model.userId, userId)))
      .limit(1);
    if (!m) return Response.json({ error: "Model not found" }, { status: 404 });
    targetModelId = m.id;
    targetModelName = m.name;
  } else {
    // Default: most recent non-archived model
    const [m] = await db
      .select({ id: model.id, name: model.name })
      .from(model)
      .where(and(eq(model.userId, userId)))
      .limit(1);
    if (!m) return Response.json({ error: "No models available — train a model first" }, { status: 400 });
    targetModelId = m.id;
    targetModelName = m.name;
  }

  // Create the suite run record
  const suiteRunId = crypto.randomUUID();
  await db.insert(benchmarkSuiteRun).values({
    id: suiteRunId,
    userId,
    status: "queued",
    benchmarks: JSON.stringify([id]),
    targets: JSON.stringify([targetModelId]),
  });

  return Response.json(
    {
      suiteRunId,
      benchmarkId: id,
      benchmarkName: bm.name,
      modelId: targetModelId,
      modelName: targetModelName,
      status: "queued",
    },
    { status: 202 },
  );
}
