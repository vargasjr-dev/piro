import { eq, sql } from "drizzle-orm";
import { getDb } from "./db-helper";
import { integration, fileIndex } from "../../../data/schema";
import { createHash, createHmac } from "crypto";
import { r2Put, r2Key } from "../r2";

/** Verify Telegram Login Widget hash */
export function verifyTelegramHash(data: Record<string, string>, botToken: string): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;

  // Build data-check-string: sorted "key=value\n" pairs
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  // For Login Widget: secretKey = SHA256(botToken)
  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");

  return expectedHash === hash;
}

export async function syncTelegram(integrationId: string, userId: string, chatId: string) {
  const db = getDb();

  // Note: getUpdates only returns unprocessed updates.
  // If a webhook is active, this will return empty — which is expected.
  // Messages are ingested in real-time via ingestTelegramMessage().
  // This sync call just refreshes the itemCount from the fileIndex.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fileIndex)
    .where(eq(fileIndex.integrationId, integrationId));

  await db
    .update(integration)
    .set({ lastSyncAt: new Date(), itemCount: count, status: "active", updatedAt: new Date() })
    .where(eq(integration.id, integrationId));

  return { inserted: 0, total: count };
}

/** Called by the VargasJR webhook to log incoming messages into Piro's KB */
export async function ingestTelegramMessage(
  telegramUserId: string,
  messageId: number,
  text: string,
  direction: "in" | "out",
  date: Date
) {
  const db = getDb();

  // Find an active Telegram integration for this user
  const [integ] = await db
    .select()
    .from(integration)
    .where(eq(integration.providerUserId, String(telegramUserId)))
    .limit(1);

  if (!integ) return; // user hasn't connected Telegram to Piro

  const bucket = date.toISOString().slice(0, 10); // yyyy-mm-dd
  const key = r2Key(integ.userId, "telegram", `${bucket}/${messageId}-${direction}.md`);

  const content = [
    `# Message ${messageId}`,
    `**Direction:** ${direction === "in" ? "Received" : "Sent"}`,
    `**Date:** ${date.toISOString()}`,
    ``,
    text,
  ].join("\n");

  try {
    await r2Put(key, content);
    await db
      .insert(fileIndex)
      .values({
        id: crypto.randomUUID(),
        userId: integ.userId,
        integrationId: integ.id,
        provider: "telegram",
        itemType: "message",
        r2Key: key,
        title: text.slice(0, 80),
        itemCreatedAt: date,
      })
      .onConflictDoNothing();

    // Increment itemCount
    await db
      .update(integration)
      .set({ itemCount: sql`${integration.itemCount} + 1`, updatedAt: new Date() })
      .where(eq(integration.id, integ.id));
  } catch {
    // ignore
  }
}
