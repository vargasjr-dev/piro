import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { mentor } from "../../../../../data/schema";
import { z } from "zod/v4";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  model: z
    .enum(["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"])
    .optional(),
  systemPrompt: z.string().min(1).optional(),
  temperature: z.number().min(0).max(1).optional(),
});

async function getOwnedMentor(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(mentor)
    .where(and(eq(mentor.id, id), eq(mentor.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await getOwnedMentor(id, session.user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ mentor: row });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await getOwnedMentor(id, session.user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const [updated] = await db
    .update(mentor)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(mentor.id, id))
    .returning();

  return NextResponse.json({ mentor: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await getOwnedMentor(id, session.user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(mentor).where(eq(mentor.id, id));

  return NextResponse.json({ ok: true });
}
