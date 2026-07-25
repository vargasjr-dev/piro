import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { piroFetch, resolveConfig } from "../client.js";
import { errorMessage, repoSummarySchema } from "../response-schemas.js";
import { z } from "zod";

const reposResponseSchema = z.object({ repos: z.array(repoSummarySchema) });
const repoResponseSchema = z.object({ repo: repoSummarySchema });
const configSchema = z.object({ repoId: z.string().optional() });

type RepoSummary = z.infer<typeof repoSummarySchema>;

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

const PIRO_DIR = ".piro";
const PIRO_CONFIG = ".piro/config";

export async function getActiveRepoId(): Promise<string | null> {
  try {
    const config = configSchema.parse(
      JSON.parse(await readFile(PIRO_CONFIG, "utf-8")),
    );
    return config.repoId ?? null;
  } catch {
    return null;
  }
}

export async function reposList() {
  const config = resolveConfig();
  const { ok, status, body } = await piroFetch(config, "/api/repos");
  if (!ok) {
    console.error(`Error ${status}: ${errorMessage(body, "list failed")}`);
    process.exit(1);
  }
  const parsed = reposResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Error 502: repository list response was invalid");
    process.exit(1);
  }
  const activeId = await getActiveRepoId();
  if (parsed.data.repos.length === 0) {
    console.log("No repositories found.");
    return;
  }
  for (const r of parsed.data.repos) {
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
  const payload: Record<string, string> = {
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
    console.error(`Error ${status}: ${errorMessage(body, "create failed")}`);
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
    console.error(`Error ${status}: ${errorMessage(body, "link failed")}`);
    process.exit(1);
  }
  console.log(`Linked repository: ${id}`);
}

export async function reposUse(id: string) {
  if (!existsSync(PIRO_DIR)) await mkdir(PIRO_DIR, { recursive: true });
  let config: Record<string, unknown> = {};
  try {
    config = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(await readFile(PIRO_CONFIG, "utf-8")));
  } catch {
    // no existing config — start fresh
  }
  config.repoId = id;
  await writeFile(PIRO_CONFIG, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`Active repository set to: ${id}`);
  console.log(`  Written to ${PIRO_CONFIG}`);
}

export async function getRepoSummary(
  config: ReturnType<typeof resolveConfig>,
  id: string,
): Promise<RepoSummary> {
  const response = await piroFetch(
    config,
    `/api/repos/${encodeURIComponent(id)}`,
  );
  if (!response.ok) {
    console.error(
      `Error ${response.status}: ${errorMessage(response.body, "repository lookup failed")}`,
    );
    process.exit(1);
  }
  const parsed = repoResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    console.error("Error 502: repository response was invalid");
    process.exit(1);
  }
  return parsed.data.repo;
}
