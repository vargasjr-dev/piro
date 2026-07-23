import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

export async function resolveRequestUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth) return keyAuth.userId;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}
