import { eq, sql } from "drizzle-orm";
import { getDb } from "./db-helper";
import { integration, knowledgeItem } from "../../../data/schema";

export async function syncGitHub(integrationId: string, userId: string, accessToken: string) {
  const db = getDb();
  let inserted = 0;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Piro-KB/1.0",
  };

  // Get user's repos (most recently updated first, limit 15)
  const repos = await fetch(
    "https://api.github.com/user/repos?per_page=15&sort=updated&affiliation=owner",
    { headers }
  ).then((r) => r.json() as Promise<GHRepo[]>);

  if (!Array.isArray(repos)) throw new Error("GitHub API error fetching repos");

  for (const repo of repos) {
    // Commits (last 100 by the authed user)
    const commits = await fetch(
      `https://api.github.com/repos/${repo.full_name}/commits?per_page=100&author=${repo.owner.login}`,
      { headers }
    ).then((r) => r.json() as Promise<GHCommit[]>);

    if (Array.isArray(commits)) {
      for (const c of commits) {
        const msg = c.commit.message.split("\n")[0]; // first line only
        if (!msg.trim()) continue;
        try {
          await db
            .insert(knowledgeItem)
            .values({
              id: crypto.randomUUID(),
              userId,
              integrationId,
              provider: "github",
              itemType: "commit",
              externalId: c.sha,
              content: `[${repo.name}] ${msg}`,
              contentMeta: JSON.stringify({
                repo: repo.full_name,
                sha: c.sha,
                url: c.html_url,
                date: c.commit.author?.date,
              }),
              itemCreatedAt: c.commit.author?.date ? new Date(c.commit.author.date) : null,
            })
            .onConflictDoNothing();
          inserted++;
        } catch {
          // skip individual failures
        }
      }
    }

    // PRs (last 50 merged)
    const prs = await fetch(
      `https://api.github.com/repos/${repo.full_name}/pulls?state=closed&per_page=50&sort=updated`,
      { headers }
    ).then((r) => r.json() as Promise<GHPR[]>);

    if (Array.isArray(prs)) {
      for (const pr of prs.filter((p) => p.merged_at)) {
        try {
          await db
            .insert(knowledgeItem)
            .values({
              id: crypto.randomUUID(),
              userId,
              integrationId,
              provider: "github",
              itemType: "pr",
              externalId: `pr-${pr.number}-${repo.full_name}`,
              content: `[${repo.name}] PR #${pr.number}: ${pr.title}${pr.body ? "\n" + pr.body.slice(0, 500) : ""}`,
              contentMeta: JSON.stringify({
                repo: repo.full_name,
                number: pr.number,
                url: pr.html_url,
                mergedAt: pr.merged_at,
              }),
              itemCreatedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            })
            .onConflictDoNothing();
          inserted++;
        } catch {
          // skip
        }
      }
    }
  }

  // Update item count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeItem)
    .where(eq(knowledgeItem.integrationId, integrationId));

  await db
    .update(integration)
    .set({ lastSyncAt: new Date(), itemCount: count, status: "active", updatedAt: new Date() })
    .where(eq(integration.id, integrationId));

  return { inserted, total: count };
}

// ---- Types ----
interface GHRepo {
  full_name: string;
  name: string;
  owner: { login: string };
}
interface GHCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { date: string } };
}
interface GHPR {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
}
