import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration } from "../../../../../../data/schema";

const BASE = process.env.BETTER_AUTH_URL ?? "https://piro-henna.vercel.app";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/knowledge?error=gmail_oauth_failed", req.url));
  }

  const redirectUri = `${BASE}/api/auth/callback/gmail`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  }).then((r) => r.json() as Promise<GoogleTokenResponse>);

  if (!tokenRes.access_token) {
    return NextResponse.redirect(new URL("/knowledge?error=gmail_token_failed", req.url));
  }

  // Get Google user info
  const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` },
  }).then((r) => r.json() as Promise<{ id: string; email: string; name?: string }>);

  const expiresAt = tokenRes.expires_in
    ? new Date(Date.now() + tokenRes.expires_in * 1000)
    : null;

  const existing = await db
    .select()
    .from(integration)
    .where(and(eq(integration.userId, session.user.id), eq(integration.provider, "gmail")))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(integration)
      .set({
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token ?? existing[0].refreshToken,
        expiresAt,
        providerUserId: userInfo.id,
        providerUsername: userInfo.email,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(integration.id, existing[0].id));
  } else {
    await db.insert(integration).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      provider: "gmail",
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? null,
      expiresAt,
      providerUserId: userInfo.id,
      providerUsername: userInfo.email,
      status: "active",
    });
  }

  const res = NextResponse.redirect(new URL("/knowledge", req.url));
  res.cookies.delete("oauth_state");
  return res;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}
