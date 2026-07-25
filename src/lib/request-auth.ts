import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { isAdmin } from "~/lib/admin";
import { auth } from "~/lib/auth.server";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import { db } from "../../data/db";
import { user } from "../../data/schema";

export async function resolveRequestAuth(
  request: Request,
): Promise<{ userId: string; isAdmin: boolean } | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (!keyAuth) return null;

    const [account] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, keyAuth.userId))
      .limit(1);

    return { userId: keyAuth.userId, isAdmin: account?.role === "admin" };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    userId: session.user.id,
    isAdmin: isAdmin(session),
  };
}
