import { eq, sql } from "drizzle-orm";
import { getDb } from "./db-helper";
import { integration, fileIndex } from "../../../data/schema";
import { r2Put, r2Key } from "../r2";

export async function syncGitHub(integrationId: string, userId: string, accessToken: string) {
  const db = getDb();
  let inserted = 0;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Piro-KB/1.0",
  };

  // Fetch user's 15 most recently updated repos (owner only)
  const reposRaw = await fetch(
    "https://api.github.com/user/repos?per_page=15&sort=updated&affiliation=owner",
    { headers }
  ).then((r) => r.json());

  if (!Array.isArray(reposRaw)) {
    const msg = (reposRaw as { message?: string })?.message ?? JSON.stringify(reposRaw);
    throw new Error(`GitHub API error fetching repos: ${msg}`);
  }
  const repos = reposRaw as GHRepo[];

  for (const repo of repos) {
    // ---- Commits (last 100 by the authed user) ----
    const commits = await fetch(
      `https://api.github.com/repos/${repo.full_name}/commits?per_page=100&author=${repo.owner.login}`,
      { headers }
    ).then((r) => r.json() as Promise<GHCommit[]>);

    if (Array.isArray(commits)) {
      for (const c of commits) {
        const subject = c.commit.message.split("\n")[0].trim();
        if (!subject) continue;

        const body = c.commit.message.split("\n").slice(2).join("\n").trim();
        const date = c.commit.author?.date ?? "";
        const key = r2Key(userId, "github", `${repo.full_name}/commits/${c.sha}.md`);

        const content = [
          `# Commit: ${c.sha.slice(0, 8)}`,
          `**Repo:** ${repo.full_name}`,
          `**Date:** ${date}`,
          `**URL:** ${c.html_url}`,
          ``,
          `## Message`,
          subject,
          body ? `\n${body}` : "",
        ]
          .join("\n")
          .trimEnd();

        try {
          await r2Put(key, content);
          await db
            .insert(fileIndex)
            .values({
              id: crypto.randomUUID(),
              userId,
              integrationId,
              provider: "github",
              itemType: "commit",
              r2Key: key,
              title: `[${repo.name}] ${subject}`,
              itemCreatedAt: date ? new Date(date) : null,
            })
            .onConflictDoNothing();
          inserted++;
        } catch {
          // skip individual failures
        }
      }
    }

    // ---- Merged PRs (last 50) ----
    const prs = await fetch(
      `https://api.github.com/repos/${repo.full_name}/pulls?state=closed&per_page=50&sort=updated`,
      { headers }
    ).then((r) => r.json() as Promise<GHPR[]>);

    if (Array.isArray(prs)) {
      for (const pr of prs.filter((p) => p.merged_at)) {
        const key = r2Key(userId, "github", `${repo.full_name}/prs/${pr.number}.md`);

        const content = [
          `# PR #${pr.number}: ${pr.title}`,
          `**Repo:** ${repo.full_name}`,
          `**Merged:** ${pr.merged_at}`,
          `**URL:** ${pr.html_url}`,
          ``,
          pr.body ? `## Description\n${pr.body.slice(0, 2000)}` : "",
        ]
          .join("\n")
          .trimEnd();

        try {
          await r2Put(key, content);
          await db
            .insert(fileIndex)
            .values({
              id: crypto.randomUUID(),
              userId,
              integrationId,
              provider: "github",
              itemType: "pr",
              r2Key: key,
              title: `[${repo.name}] PR #${pr.number}: ${pr.title}`,
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

  // Update integration metadata
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fileIndex)
    .where(eq(fileIndex.integrationId, integrationId));

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
