import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { dataSource } from "../../../../data/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
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

  const sources = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.userId, userId))
    .orderBy(desc(dataSource.createdAt));

  return Response.json({
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: s.type,
      r2Prefix: s.r2Prefix,
      sampleCount: s.sampleCount,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

interface CreateBody {
  id?: string;
  name: string;
  description?: string;
  type?: string;
  sampleCount?: number;
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, description, type = "synthetic", sampleCount } = body;
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  // Allow callers to specify a slug-like id (e.g. "counter-sequences")
  // so push/pull can reference it by name. Fall back to a random UUID.
  const id = body.id ?? randomUUID();
  const r2Prefix = `sources/${id}/`;
  const scriptR2Key = `${userId}/${r2Prefix}script.py`;

  await db.insert(dataSource).values({
    id,
    userId,
    name,
    description: description ?? null,
    type,
    r2Prefix,
    scriptR2Key,
    sampleCount: sampleCount ?? null,
  });

  return Response.json({ id }, { status: 201 });
}
