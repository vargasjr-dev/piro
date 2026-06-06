import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { integration } from "../../../../../data/schema";
import { r2DeletePrefix, r2ProviderPrefix } from "~/lib/r2";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fetch before deleting so we know the provider
  const [integ] = await db
    .select()
    .from(integration)
    .where(and(eq(integration.id, id), eq(integration.userId, session.user.id)))
    .limit(1);

  if (!integ) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Purge all R2 files for this user + provider (fire-and-forget friendly — errors don't block DB delete)
  try {
    await r2DeletePrefix(r2ProviderPrefix(session.user.id, integ.provider));
  } catch (e) {
    console.error("R2 purge failed (continuing with DB delete):", e);
  }

  // Cascade deletes fileIndex rows too (FK constraint)
  await db
    .delete(integration)
    .where(and(eq(integration.id, id), eq(integration.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
