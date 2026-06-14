import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { mentor } from "../../../../data/schema";
import { z } from "zod/v4";

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  model: z.enum(["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"]),
  systemPrompt: z.string().min(1),
  temperature: z.number().min(0).max(1),
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mentors = await db
    .select()
    .from(mentor)
    .where(eq(mentor.userId, session.user.id))
    .orderBy(desc(mentor.createdAt));

  return NextResponse.json({ mentors });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const { name, description, model, systemPrompt, temperature } = parsed.data;

  const [created] = await db
    .insert(mentor)
    .values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      name,
      description: description ?? null,
      model,
      systemPrompt,
      temperature,
    })
    .returning();

  return NextResponse.json({ mentor: created }, { status: 201 });
}
