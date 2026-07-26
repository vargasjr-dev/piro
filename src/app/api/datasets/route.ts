import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { dataset } from "../../../../data/schema";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const datasets = await db
    .select({
      id: dataset.id,
      name: dataset.name,
      sourcePath: dataset.sourcePath,
      evaluationConfig: dataset.evaluationConfig,
      sampleCount: dataset.sampleCount,
      generatedAt: dataset.generatedAt,
      createdAt: dataset.createdAt,
    })
    .from(dataset)
    .where(eq(dataset.userId, userId))
    .orderBy(desc(dataset.createdAt));

  return Response.json({
    datasets: datasets.map((item) => ({
      ...item,
      generatedAt: item.generatedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}
