import { eq, sql } from "drizzle-orm";
import { getDb } from "./db-helper";
import { integration, fileIndex } from "../../../data/schema";
import { r2Put, r2Key } from "../r2";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export async function syncGmail(integrationId: string, userId: string, accessToken: string) {
  const db = getDb();
  let inserted = 0;

  const auth = `Bearer ${accessToken}`;

  // Get list of messages (last 200 in inbox + sent)
  const listRes = await fetch(
    `${GMAIL_API}/users/me/messages?maxResults=200&q=in:inbox OR in:sent`,
    { headers: { Authorization: auth } }
  ).then((r) => r.json() as Promise<{ messages?: { id: string }[] }>);

  const messages = listRes.messages ?? [];

  for (const msg of messages) {
    const detail = await fetch(
      `${GMAIL_API}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject,From,To,Date`,
      { headers: { Authorization: auth } }
    ).then((r) => r.json() as Promise<GmailMessage>);

    const hdrs = Object.fromEntries(
      (detail.payload?.headers ?? []).map((h) => [h.name, h.value])
    );
    const subject = hdrs["Subject"] ?? "(no subject)";
    const from = hdrs["From"] ?? "";
    const to = hdrs["To"] ?? "";
    const date = hdrs["Date"] ?? "";

    // Group by date: yyyy-mm bucket for clean directory structure
    const bucket = date ? new Date(date).toISOString().slice(0, 7) : "unknown";
    const key = r2Key(userId, "email", `${bucket}/${msg.id}.md`);

    const content = [
      `# ${subject}`,
      `**From:** ${from}`,
      `**To:** ${to}`,
      `**Date:** ${date}`,
      `**Thread:** ${detail.threadId}`,
    ]
      .join("\n")
      .trimEnd();

    try {
      await r2Put(key, content);
      await db
        .insert(fileIndex)
        .values({
          id: crypto.randomUUID(),
          userId,
          integrationId,
          provider: "gmail",
          itemType: "email",
          r2Key: key,
          title: `${subject} — ${from}`,
          itemCreatedAt: date ? new Date(date) : null,
        })
        .onConflictDoNothing();
      inserted++;
    } catch {
      // skip
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fileIndex)
    .where(eq(fileIndex.integrationId, integrationId));

  await db
    .update(integration)
    .set({ lastSyncAt: new Date(), itemCount: count, status: "active", updatedAt: new Date() })
    .where(eq(integration.id, integrationId));

  return { inserted, total: count };
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload?: {
    headers?: { name: string; value: string }[];
  };
}
