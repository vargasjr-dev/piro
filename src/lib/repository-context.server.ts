import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../data/db";
import { account, repository, user } from "../../data/schema";
import { type GitHubRepositoryRef } from "~/lib/github-repository";

export async function getRepositoryContext(username: string, slug: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [owner] = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  if (!owner) return null;

  const [repo] = await db
    .select({
      id: repository.id,
      slug: repository.slug,
      name: repository.name,
      githubOwner: repository.githubOwner,
      githubRepository: repository.githubRepository,
    })
    .from(repository)
    .where(and(eq(repository.userId, owner.id), eq(repository.slug, slug)))
    .limit(1);
  if (!repo) return null;

  const [githubAccount] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, owner.id), eq(account.providerId, "github")))
    .limit(1);

  const githubRepo: GitHubRepositoryRef | null =
    repo.githubOwner && repo.githubRepository
      ? {
          owner: repo.githubOwner,
          repository: repo.githubRepository,
        }
      : null;

  return {
    owner,
    repo,
    accessToken: githubAccount?.accessToken,
    githubRepo,
  };
}
