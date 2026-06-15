import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { dataSource } from "../../../../data/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sources = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.userId, session.user.id))
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
  name: string;
  description?: string;
  type?: string;
  r2Prefix?: string;
  sampleCount?: number;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, description, type = "synthetic", r2Prefix, sampleCount } = body;
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const id = randomUUID();
  await db.insert(dataSource).values({
    id,
    userId: session.user.id,
    name,
    description: description ?? null,
    type,
    r2Prefix: r2Prefix ?? null,
    sampleCount: sampleCount ?? null,
  });

  return Response.json({ id }, { status: 201 });
}
