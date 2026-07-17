import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { piroFetch, resolveConfig } from "../client.js";

/**
 * piro repos list / create / use
 *
 *   piro repos list
 *   piro repos create <id> --name <name> --github-repository <owner/repo> [--description <desc>]
 *   piro repos link <id> --github-repository <owner/repo>
 *   piro repos use <id>     — sets active repo in .piro/config
 *
 * The active repo is stored in .piro/config as { "repoId": "<id>" }.
 * Other commands (sources, classes, benchmarks) will read this to scope
 * operations to the active repo.
 */

interface RepoSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerUsername: string | null;
  githubOwner: string | null;
  githubRepository: string | null;
  createdAt: string;
}

const PIRO_DIR = ".piro";
const PIRO_CONFIG = ".piro/config";

/** Read the active repo id from .piro/config, or null if not set. */
export async function getActiveRepoId(): Promise<string | null> {
  try {
    const content = await readFile(PIRO_CONFIG, "utf-8");
    const config = JSON.parse(content);
    return config.repoId ?? null;
  } catch {
    return null;
  }
}

export async function reposList() {
  const config = resolveConfig();

  const { ok, status, body } = await piroFetch(config, "/api/repos");

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "list failed"}`);
    process.exit(1);
  }

  const { repos } = body as { repos: RepoSummary[] };
  const activeId = await getActiveRepoId();

  if (repos.length === 0) {
    console.log("No repositories found.");
    return;
  }

  for (const r of repos) {
    const active = r.id === activeId ? " ← active" : "";
    const desc = r.description ? ` — ${r.description.slice(0, 50)}` : "";
    const handle = r.ownerUsername ? `${r.ownerUsername}/${r.slug}` : r.id;
    console.log(`${handle}  ${r.name}${desc}${active}`);
  }
}

export async function reposCreate(
  id: string,
  opts: { name: string; githubRepository: string; description?: string },
) {
  const config = resolveConfig();

  const payload: Record<string, unknown> = {
    id,
    name: opts.name,
    githubRepository: opts.githubRepository,
  };
  if (opts.description) payload.description = opts.description;

  const { ok, status, body } = await piroFetch(config, "/api/repos", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "create failed"}`);
    process.exit(1);
  }

  console.log(`Created repository: ${id}`);
}

export async function reposLink(id: string, githubRepository: string) {
  const config = resolveConfig();
  const { ok, status, body } = await piroFetch(
    config,
    `/api/repos/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ githubRepository }),
    },
  );

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "link failed"}`);
    process.exit(1);
  }

  console.log(`Linked repository: ${id}`);
}

export async function reposUse(id: string) {
  // Write .piro/config with the active repo id
  if (!existsSync(PIRO_DIR)) {
    await mkdir(PIRO_DIR, { recursive: true });
  }

  let config: Record<string, unknown> = {};
  try {
    const existing = await readFile(PIRO_CONFIG, "utf-8");
    config = JSON.parse(existing);
  } catch {
    // no existing config — start fresh
  }

  config.repoId = id;
  await writeFile(PIRO_CONFIG, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`Active repository set to: ${id}`);
  console.log(`  Written to ${PIRO_CONFIG}`);
}
