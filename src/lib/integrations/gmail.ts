import { eq, sql } from "drizzle-orm";
import { getDb } from "./db-helper";
import { integration, knowledgeItem } from "../../../data/schema";

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

  // Fetch metadata for each (subject, from, date) — batch with individual calls
  for (const msg of messages) {
    const detail = await fetch(
      `${GMAIL_API}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject,From,To,Date`,
      { headers: { Authorization: auth } }
    ).then((r) => r.json() as Promise<GmailMessage>);

    const headers = Object.fromEntries(
      (detail.payload?.headers ?? []).map((h) => [h.name, h.value])
    );
    const subject = headers["Subject"] ?? "(no subject)";
    const from = headers["From"] ?? "";
    const to = headers["To"] ?? "";
    const date = headers["Date"] ?? "";

    try {
      await db
        .insert(knowledgeItem)
        .values({
          id: crypto.randomUUID(),
          userId,
          integrationId,
          provider: "gmail",
          itemType: "email",
          externalId: msg.id,
          content: `Subject: ${subject}\nFrom: ${from}\nTo: ${to}`,
          contentMeta: JSON.stringify({ subject, from, to, date, threadId: detail.threadId }),
          itemCreatedAt: date ? new Date(date) : null,
        })
        .onConflictDoNothing();
      inserted++;
    } catch {
      // skip
    }
  }

  // Update item count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeItem)
    .where(eq(knowledgeItem.integrationId, integrationId));

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
