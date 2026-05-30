import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration } from "../../../../../../data/schema";
import { syncGitHub } from "~/lib/integrations/github";
import { syncGmail } from "~/lib/integrations/gmail";
import { syncTelegram } from "~/lib/integrations/telegram";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [integ] = await db
    .select()
    .from(integration)
    .where(and(eq(integration.id, id), eq(integration.userId, session.user.id)))
    .limit(1);

  if (!integ) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark as syncing
  await db
    .update(integration)
    .set({ status: "syncing", updatedAt: new Date() })
    .where(eq(integration.id, id));

  try {
    let result: { inserted: number; total: number };

    if (integ.provider === "github") {
      if (!integ.accessToken) throw new Error("No access token");
      result = await syncGitHub(id, session.user.id, integ.accessToken);
    } else if (integ.provider === "gmail") {
      if (!integ.accessToken) throw new Error("No access token");
      result = await syncGmail(id, session.user.id, integ.accessToken);
    } else if (integ.provider === "telegram") {
      if (!integ.providerUserId) throw new Error("No Telegram user ID");
      result = await syncTelegram(id, session.user.id, integ.providerUserId);
    } else {
      throw new Error(`Unknown provider: ${integ.provider}`);
    }

    const [updated] = await db
      .select()
      .from(integration)
      .where(eq(integration.id, id))
      .limit(1);

    return NextResponse.json({ ok: true, ...result, integration: updated });
  } catch (e) {
    await db
      .update(integration)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(integration.id, id));
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
