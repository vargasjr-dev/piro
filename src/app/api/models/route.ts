import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { model, modelHostedApi, modelTrainingRun, benchmarkRun } from "../../../../data/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const models = await db
    .select()
    .from(model)
    .where(eq(model.userId, session.user.id))
    .orderBy(model.createdAt);

  // Fetch hosted API info for all models
  const hostedApis = await db
    .select()
    .from(modelHostedApi)
    .where(
      eq(
        modelHostedApi.modelId,
        sql`ANY(ARRAY[${sql.join(
          models.map((m) => sql`${m.id}`),
          sql`, `,
        )}])`,
      ),
    );

  // Fetch training run links
  const trainingLinks = await db
    .select()
    .from(modelTrainingRun)
    .where(
      eq(
        modelTrainingRun.modelId,
        sql`ANY(ARRAY[${sql.join(
          models.map((m) => sql`${m.id}`),
          sql`, `,
        )}])`,
      ),
    );

  // Benchmark run counts per model (target = model.id)
  const counts = await db
    .select({
      target: benchmarkRun.target,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(benchmarkRun)
    .where(eq(benchmarkRun.userId, session.user.id))
    .groupBy(benchmarkRun.target);

  const countByTarget = Object.fromEntries(counts.map((c) => [c.target, c.count]));
  const hostedByModelId = Object.fromEntries(hostedApis.map((h) => [h.modelId, h]));
  const trainingByModelId = Object.fromEntries(trainingLinks.map((t) => [t.modelId, t]));

  return Response.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      parameterCount: m.parameterCount,
      createdAt: m.createdAt.toISOString(),
      hostedApi: hostedByModelId[m.id]
        ? {
            provider: hostedByModelId[m.id].provider,
            apiModelName: hostedByModelId[m.id].apiModelName,
          }
        : null,
      trainingRunId: trainingByModelId[m.id]?.trainingRunId ?? null,
      benchmarkRunCount: countByTarget[m.id] ?? 0,
    })),
  });
}
