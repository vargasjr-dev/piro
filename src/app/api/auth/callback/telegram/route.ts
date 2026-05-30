import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { createHash, createHmac } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration } from "../../../../../../data/schema";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.redirect(new URL("/knowledge?error=telegram_not_configured", req.url));
  }

  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => { params[k] = v; });

  const { hash, ...data } = params;
  if (!hash) {
    return NextResponse.redirect(new URL("/knowledge?error=telegram_no_hash", req.url));
  }

  // Verify Telegram hash
  const checkString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (expectedHash !== hash) {
    return NextResponse.redirect(new URL("/knowledge?error=telegram_invalid_hash", req.url));
  }

  // auth_date must be within 24h
  const authDate = parseInt(data.auth_date ?? "0", 10);
  if (Date.now() / 1000 - authDate > 86400) {
    return NextResponse.redirect(new URL("/knowledge?error=telegram_expired", req.url));
  }

  const telegramId = data.id;
  const username = data.username ?? data.first_name ?? "unknown";

  const existing = await db
    .select()
    .from(integration)
    .where(and(eq(integration.userId, session.user.id), eq(integration.provider, "telegram")))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(integration)
      .set({
        providerUserId: telegramId,
        providerUsername: username,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(integration.id, existing[0].id));
  } else {
    await db.insert(integration).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      provider: "telegram",
      providerUserId: telegramId,
      providerUsername: username,
      status: "active",
    });
  }

  return NextResponse.redirect(new URL("/knowledge", req.url));
}
