import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration, fileIndex, syncJob } from "../../../../../../data/schema";
import { syncGitHub } from "~/lib/integrations/github";
import { syncGmail } from "~/lib/integrations/gmail";
import { syncTelegram } from "~/lib/integrations/telegram";
import { syncRoam } from "~/lib/integrations/roam";
import type { SyncProgress } from "~/lib/integrations/types";

async function writeProgress(integrationId: string, meta: SyncProgress) {
  await db
    .update(integration)
    .set({ syncMeta: JSON.stringify(meta), updatedAt: new Date() })
    .where(eq(integration.id, integrationId));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [integ] = await db
    .select()
    .from(integration)
    .where(and(eq(integration.id, id), eq(integration.userId, session.user.id)))
    .limit(1);

  if (!integ)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (integ.status === "syncing")
    return NextResponse.json({ error: "Already syncing" }, { status: 409 });

  // Create the sync job record up-front so history shows "running"
  const jobId = crypto.randomUUID();
  const startedAt = new Date();

  await db.insert(syncJob).values({
    id: jobId,
    integrationId: id,
    userId: session.user.id,
    status: "running",
    startedAt,
  });

  // Mark integration as syncing
  await db
    .update(integration)
    .set({
      status: "syncing",
      syncMeta: JSON.stringify({ step: "Starting…", done: 0, total: 0 }),
      updatedAt: new Date(),
    })
    .where(eq(integration.id, id));

  const onProgress = (meta: SyncProgress) => writeProgress(id, meta);

  // Run sync in the background — request returns 202 immediately
  waitUntil(
    (async () => {
      try {
        let result = { filesWritten: 0, bytesWritten: 0 };

        if (integ.provider === "github") {
          if (!integ.accessToken) throw new Error("No access token");
          result = await syncGitHub(
            id,
            session.user.id,
            integ.accessToken,
            onProgress,
          );
        } else if (integ.provider === "gmail") {
          if (!integ.accessToken) throw new Error("No access token");
          result = await syncGmail(id, session.user.id, integ.accessToken);
        } else if (integ.provider === "telegram") {
          if (!integ.providerUserId) throw new Error("No Telegram user ID");
          result = await syncTelegram(
            id,
            session.user.id,
            integ.providerUserId,
          );
        } else if (integ.provider === "roam") {
          if (!integ.accessToken) throw new Error("No API token");
          if (!integ.providerUsername) throw new Error("No graph name");
          result = await syncRoam(
            id,
            session.user.id,
            integ.accessToken,
            integ.providerUsername,
            onProgress,
          );
        } else {
          throw new Error(`Unknown provider: ${integ.provider}`);
        }

        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();

        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(fileIndex)
          .where(eq(fileIndex.integrationId, id));

        // Complete the job record
        await db
          .update(syncJob)
          .set({
            status: "complete",
            finishedAt,
            durationMs,
            filesWritten: result.filesWritten,
            bytesWritten: result.bytesWritten,
          })
          .where(eq(syncJob.id, jobId));

        // Update integration
        await db
          .update(integration)
          .set({
            status: "active",
            syncMeta: null,
            lastSyncAt: finishedAt,
            itemCount: count,
            updatedAt: new Date(),
          })
          .where(eq(integration.id, id));
      } catch (e) {
        const msg = String(e);
        const reconnect =
          msg.includes("Bad credentials") ||
          msg.includes("401") ||
          msg.includes("Unauthorized");

        const finishedAt = new Date();

        await db
          .update(syncJob)
          .set({
            status: "error",
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            error: msg,
          })
          .where(eq(syncJob.id, jobId));

        await db
          .update(integration)
          .set({
            status: "error",
            syncMeta: JSON.stringify({ step: "Failed", error: msg, reconnect }),
            updatedAt: new Date(),
          })
          .where(eq(integration.id, id));
      }
    })(),
  );

  return NextResponse.json(
    { ok: true, status: "syncing", jobId },
    { status: 202 },
  );
}
