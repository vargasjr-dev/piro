import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration, fileIndex } from "../../../../../../data/schema";
import { syncGitHub } from "~/lib/integrations/github";
import { syncGmail } from "~/lib/integrations/gmail";
import { syncTelegram } from "~/lib/integrations/telegram";
import { syncRoam } from "~/lib/integrations/roam";
import type { SyncProgress } from "~/lib/integrations/types";

async function writeProgress(id: string, meta: SyncProgress) {
  await db
    .update(integration)
    .set({ syncMeta: JSON.stringify(meta), updatedAt: new Date() })
    .where(eq(integration.id, id));
}

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
  if (integ.status === "syncing") return NextResponse.json({ error: "Already syncing" }, { status: 409 });

  // Mark as syncing immediately
  await db
    .update(integration)
    .set({ status: "syncing", syncMeta: JSON.stringify({ step: "Starting…", done: 0, total: 0 }), updatedAt: new Date() })
    .where(eq(integration.id, id));

  const onProgress = (meta: SyncProgress) => writeProgress(id, meta);

  // Run sync in the background — request returns immediately
  waitUntil(
    (async () => {
      try {
        if (integ.provider === "github") {
          if (!integ.accessToken) throw new Error("No access token");
          await syncGitHub(id, session.user.id, integ.accessToken, onProgress);
        } else if (integ.provider === "gmail") {
          if (!integ.accessToken) throw new Error("No access token");
          await syncGmail(id, session.user.id, integ.accessToken);
        } else if (integ.provider === "telegram") {
          if (!integ.providerUserId) throw new Error("No Telegram user ID");
          await syncTelegram(id, session.user.id, integ.providerUserId);
        } else if (integ.provider === "roam") {
          if (!integ.accessToken) throw new Error("No API token");
          if (!integ.providerUsername) throw new Error("No graph name");
          await syncRoam(id, session.user.id, integ.accessToken, integ.providerUsername, onProgress);
        } else {
          throw new Error(`Unknown provider: ${integ.provider}`);
        }

        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(fileIndex)
          .where(eq(fileIndex.integrationId, id));

        await db
          .update(integration)
          .set({ status: "active", syncMeta: null, lastSyncAt: new Date(), itemCount: count, updatedAt: new Date() })
          .where(eq(integration.id, id));
      } catch (e) {
        const msg = String(e);
        const reconnect =
          msg.includes("Bad credentials") ||
          msg.includes("401") ||
          msg.includes("Unauthorized");

        await db
          .update(integration)
          .set({
            status: "error",
            syncMeta: JSON.stringify({ step: "Failed", error: msg, reconnect }),
            updatedAt: new Date(),
          })
          .where(eq(integration.id, id));
      }
    })()
  );

  // Return immediately — client will poll /status
  return NextResponse.json({ ok: true, status: "syncing" }, { status: 202 });
}
