import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { integration } from "../../../../../data/schema";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await db
    .delete(integration)
    .where(and(eq(integration.id, id), eq(integration.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
