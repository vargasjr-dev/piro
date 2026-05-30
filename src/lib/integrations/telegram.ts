import { eq, sql } from "drizzle-orm";
import { getDb } from "./db-helper";
import { integration, knowledgeItem } from "../../../data/schema";
import { createHmac } from "crypto";

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
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");

  // Note: getUpdates only returns unprocessed updates.
  // If a webhook is active, this will return empty — which is expected.
  // Messages are synced in real-time via the webhook instead.
  // This sync call just refreshes the itemCount from what's already stored.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeItem)
    .where(eq(knowledgeItem.integrationId, integrationId));

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

  try {
    await db
      .insert(knowledgeItem)
      .values({
        id: crypto.randomUUID(),
        userId: integ.userId,
        integrationId: integ.id,
        provider: "telegram",
        itemType: "message",
        externalId: `${messageId}-${direction}`,
        content: text,
        contentMeta: JSON.stringify({ direction, chatId: telegramUserId }),
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
