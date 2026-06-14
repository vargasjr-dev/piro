import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { mentor } from "../../../../../../data/schema";
import { scoreResponses } from "~/lib/mentor-scorer";
import { z } from "zod/v4";

const ScoreSchema = z.object({
  prompt: z.string().min(1),
  responses: z.array(z.string().min(1)).min(1).max(20),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [row] = await db
    .select()
    .from(mentor)
    .where(and(eq(mentor.id, id), eq(mentor.userId, session.user.id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const parsed = ScoreSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const { prompt, responses } = parsed.data;

  const scores = await scoreResponses({
    model: row.model,
    temperature: row.temperature,
    systemPrompt: row.systemPrompt,
    prompt,
    responses,
  });

  // Increment scoreCount
  await db
    .update(mentor)
    .set({
      scoreCount: sql`${mentor.scoreCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(mentor.id, id));

  return NextResponse.json({ scores });
}
