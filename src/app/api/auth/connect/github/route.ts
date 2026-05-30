import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/knowledge?error=github_not_configured", req.url)
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = `${process.env.BETTER_AUTH_URL ?? "https://piro-henna.vercel.app"}/api/auth/callback/github`;

  const oauthUrl = new URL("https://github.com/login/oauth/authorize");
  oauthUrl.searchParams.set("client_id", clientId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("scope", "read:user,repo");
  oauthUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(oauthUrl.toString());
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
