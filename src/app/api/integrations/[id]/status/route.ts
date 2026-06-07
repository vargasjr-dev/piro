import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration } from "../../../../../../data/schema";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [integ] = await db
    .select({
      status: integration.status,
      syncMeta: integration.syncMeta,
      itemCount: integration.itemCount,
      lastSyncAt: integration.lastSyncAt,
      providerUsername: integration.providerUsername,
    })
    .from(integration)
    .where(and(eq(integration.id, id), eq(integration.userId, session.user.id)))
    .limit(1);

  if (!integ) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    status: integ.status,
    syncMeta: integ.syncMeta ? JSON.parse(integ.syncMeta) : null,
    itemCount: integ.itemCount,
    lastSyncAt: integ.lastSyncAt,
    providerUsername: integ.providerUsername,
  });
}
