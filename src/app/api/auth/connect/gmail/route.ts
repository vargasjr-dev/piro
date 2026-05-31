import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers as nextHeaders } from "next/headers";
import { flashError } from "~/lib/flash";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return flashError(
      NextResponse.redirect(new URL("/knowledge", req.url)),
      "gmail_not_configured",
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = `${process.env.BETTER_AUTH_URL ?? "https://piro-henna.vercel.app"}/api/auth/callback/gmail`;

  const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  oauthUrl.searchParams.set("client_id", clientId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set(
    "scope",
    "openid email profile https://www.googleapis.com/auth/gmail.readonly",
  );
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("access_type", "offline");
  oauthUrl.searchParams.set("prompt", "consent");

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
