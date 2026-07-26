import { waitUntil } from "@vercel/functions";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import { db } from "../../../../../data/db";
import { dataset, generationRun, repository } from "../../../../../data/schema";

const ENTRYPOINTS = new Set(["main.py", "model.py", "script.py"]);
const MAX_SOURCE_BYTES = 512 * 1024;

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

async function getLocalRepository(userId: string) {
  const [existing] = await db
    .select({ id: repository.id })
    .from(repository)
    .where(and(eq(repository.userId, userId), eq(repository.slug, "local")))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(repository)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: "Local workspace",
      slug: "local",
      r2Prefix: null,
    })
    .returning({ id: repository.id });
  return created;
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    path?: unknown;
    entrypoint?: unknown;
    source?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const sourcePath = typeof body?.path === "string" ? body.path.trim() : "";
  const entrypoint =
    typeof body?.entrypoint === "string" ? body.entrypoint.trim() : "";
  const source = typeof body?.source === "string" ? body.source : "";

  if (!name || !sourcePath || !source || !ENTRYPOINTS.has(entrypoint)) {
    return Response.json(
      { error: "name, path, source, and a supported entrypoint are required" },
      { status: 400 },
    );
  }
  if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    return Response.json(
      { error: "source exceeds the 512 KiB limit" },
      { status: 413 },
    );
  }

  const localRepository = await getLocalRepository(userId);
  const sourceKey = sourcePath
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-");
  const r2Prefix = `repos/${localRepository.id}/datasets/${sourceKey}`;

  const [existingDataset] = await db
    .select({ id: dataset.id })
    .from(dataset)
    .where(
      and(
        eq(dataset.repositoryId, localRepository.id),
        eq(dataset.sourcePath, sourcePath),
      ),
    )
    .limit(1);

  const datasetId = existingDataset?.id ?? crypto.randomUUID();
  if (existingDataset) {
    await db
      .update(dataset)
      .set({ updatedAt: new Date() })
      .where(eq(dataset.id, datasetId));
  } else {
    await db.insert(dataset).values({
      id: datasetId,
      userId,
      repositoryId: localRepository.id,
      name,
      sourcePath,
      r2Prefix,
    });
  }

  const runId = crypto.randomUUID();
  await db.insert(generationRun).values({
    id: runId,
    userId,
    repositoryId: localRepository.id,
    datasetId,
    sourceName: name,
    sourcePath,
    status: "queued",
  });

  const endpoint = process.env.MODAL_SOURCE_ENDPOINT;
  if (!endpoint) {
    await db
      .update(generationRun)
      .set({
        status: "error",
        error:
          "Dataset generation is not configured yet. Set MODAL_SOURCE_ENDPOINT to enable source execution.",
        completedAt: new Date(),
      })
      .where(eq(generationRun.id, runId));
    return Response.json(
      {
        runId,
        datasetId,
        message:
          "Generation run created, but source execution is not configured yet.",
      },
      { status: 202 },
    );
  }

  waitUntil(
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        datasetId,
        sourcePath,
        entrypoint,
        source,
        r2Prefix,
        callbackUrl: new URL(
          `/api/generation-runs/${runId}`,
          request.url,
        ).toString(),
        secret: process.env.MODAL_WEBHOOK_SECRET ?? "",
      }),
    })
      .then(async (response) => {
        if (response.ok) return;
        await db
          .update(generationRun)
          .set({
            status: "error",
            error: `Worker returned HTTP ${response.status}`,
            completedAt: new Date(),
          })
          .where(eq(generationRun.id, runId));
      })
      .catch(async () => {
        await db
          .update(generationRun)
          .set({
            status: "error",
            error: "Unable to reach the source-generation worker",
            completedAt: new Date(),
          })
          .where(eq(generationRun.id, runId));
      }),
  );

  return Response.json(
    { runId, datasetId, message: "Dataset generation started." },
    { status: 202 },
  );
}
