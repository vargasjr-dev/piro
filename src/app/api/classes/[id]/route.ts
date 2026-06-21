import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { modelClass } from "../../../../../data/schema";
import { eq, and } from "drizzle-orm";

// ── GET /api/classes/[id] ─────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [cls] = await db
    .select()
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, session.user.id)))
    .limit(1);

  if (!cls) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    class: {
      id: cls.id,
      name: cls.name,
      slug: cls.slug,
      description: cls.description ?? null,
      parameterCount: cls.parameterCount ?? null,
      configJson: cls.configJson ?? null,
      createdAt: cls.createdAt.toISOString(),
    },
  });
}

// ── PATCH /api/classes/[id] ───────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [cls] = await db
    .select({ id: modelClass.id })
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, session.user.id)))
    .limit(1);

  if (!cls) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    description?: string;
    parameterCount?: number | null;
    configJson?: string | null;
  };

  if (body.name !== undefined && !body.name.trim())
    return Response.json({ error: "name cannot be empty" }, { status: 400 });
  if (body.slug !== undefined && !body.slug.trim())
    return Response.json({ error: "slug cannot be empty" }, { status: 400 });

  const updates: Partial<typeof modelClass.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.slug !== undefined) updates.slug = body.slug.trim();
  if (body.description !== undefined) updates.description = body.description.trim() || null;
  if (body.parameterCount !== undefined) updates.parameterCount = body.parameterCount;
  if (body.configJson !== undefined) updates.configJson = body.configJson;

  try {
    await db.update(modelClass).set(updates).where(eq(modelClass.id, id));
    return Response.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("mc_user_slug") || msg.includes("unique")) {
      return Response.json({ error: "A class with that slug already exists" }, { status: 409 });
    }
    throw e;
  }
}
