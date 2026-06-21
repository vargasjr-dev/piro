import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration } from "../../../../../../data/schema";
import { flashError } from "~/lib/flash";

import { PRIMARY_DOMAIN } from "~/lib/domains";

const BASE = process.env.BETTER_AUTH_URL ?? PRIMARY_DOMAIN;

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return flashError(
      NextResponse.redirect(new URL("/knowledge", req.url)),
      "github_oauth_failed",
    );
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${BASE}/api/auth/callback/github`,
    }),
  }).then(
    (r) => r.json() as Promise<{ access_token?: string; error?: string }>,
  );

  if (!tokenRes.access_token) {
    return flashError(
      NextResponse.redirect(new URL("/knowledge", req.url)),
      "github_token_failed",
    );
  }

  // Get GitHub user info (also validates the token works)
  const ghUserRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenRes.access_token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Piro-KB/1.0",
    },
  });

  if (!ghUserRes.ok) {
    return flashError(
      NextResponse.redirect(new URL("/knowledge", req.url)),
      "github_token_failed",
    );
  }

  const ghUser = (await ghUserRes.json()) as { id: number; login: string };

  // Upsert integration
  const existing = await db
    .select()
    .from(integration)
    .where(
      and(
        eq(integration.userId, session.user.id),
        eq(integration.provider, "github"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(integration)
      .set({
        accessToken: tokenRes.access_token,
        providerUserId: String(ghUser.id),
        providerUsername: ghUser.login,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(integration.id, existing[0].id));
  } else {
    await db.insert(integration).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      provider: "github",
      accessToken: tokenRes.access_token,
      providerUserId: String(ghUser.id),
      providerUsername: ghUser.login,
      status: "active",
    });
  }

  const res = NextResponse.redirect(new URL("/knowledge", req.url));
  res.cookies.delete("oauth_state");
  return res;
}
