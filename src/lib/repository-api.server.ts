import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { account, repository, user } from "../../data/schema";
import { db } from "../../data/db";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

export async function resolveRepositoryUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function getOwnedRepository(request: Request, id: string) {
  const userId = await resolveRepositoryUserId(request);
  if (!userId) return null;
  const [result] = await db
    .select({
      id: repository.id,
      slug: repository.slug,
      githubOwner: repository.githubOwner,
      githubRepository: repository.githubRepository,
      ownerUsername: user.username,
      accessToken: account.accessToken,
      userId: user.id,
    })
    .from(repository)
    .innerJoin(user, eq(repository.userId, user.id))
    .leftJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "github")),
    )
    .where(and(eq(repository.id, id), eq(repository.userId, userId)))
    .limit(1);
  return result ?? null;
}
