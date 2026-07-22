import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { piroFetch, resolveConfig } from "../client.js";
import { getActiveRepoId } from "./repos.js";

interface SourceSummary {
  name: string;
  path: string;
  entrypoint: string | null;
  repository?: string;
  experiment?: string | null;
}

interface RepoSummary {
  id: string;
  slug: string;
  ownerUsername: string | null;
  githubOwner: string | null;
  githubRepository: string | null;
}

function fail(status: number, body: unknown, fallback: string): never {
  const error = body as Record<string, unknown> | null;
  console.error(`Error ${status}: ${error?.error ?? fallback}`);
  process.exit(1);
}

function sourceDirectory(root: string, experiment?: string): string {
  return experiment
    ? join(root, "experiments", experiment, "sources")
    : join(root, "sources");
}

async function discoverLocalSources(root: string): Promise<SourceSummary[]> {
  const results: SourceSummary[] = [];
  const roots: Array<{ path: string; experiment: string | null }> = [
    { path: join(root, "sources"), experiment: null },
  ];
  const experimentsRoot = join(root, "experiments");
  if (existsSync(experimentsRoot)) {
    for (const experiment of await readdir(experimentsRoot, { withFileTypes: true })) {
      if (experiment.isDirectory() && !experiment.name.startsWith(".")) {
        roots.push({
          path: sourceDirectory(root, experiment.name),
          experiment: experiment.name,
        });
      }
    }
  }

  for (const rootEntry of roots) {
    if (!existsSync(rootEntry.path)) continue;
    for (const source of await readdir(rootEntry.path, { withFileTypes: true })) {
      if (!source.isDirectory() || source.name.startsWith(".")) continue;
      const directory = join(rootEntry.path, source.name);
      const entrypoint = ["main.py", "model.py", "script.py"].find((file) =>
        existsSync(join(directory, file)),
      );
      results.push({
        name: source.name,
        path: relative(root, directory),
        entrypoint: entrypoint ?? null,
        experiment: rootEntry.experiment,
      });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

async function getRepo(config: ReturnType<typeof resolveConfig>, id: string): Promise<RepoSummary> {
  const response = await piroFetch(config, `/api/repos/${encodeURIComponent(id)}`);
  if (!response.ok) fail(response.status, response.body, "repository lookup failed");
  return (response.body as { repo: RepoSummary }).repo;
}

function printSource(source: SourceSummary): void {
  const scope = source.experiment ? ` [${source.experiment}]` : "";
  console.log(`${source.name}${scope}  ${source.path}${source.entrypoint ? `/${source.entrypoint}` : ""}`);
}

export async function sourcesList(root = process.cwd()): Promise<void> {
  const local = await discoverLocalSources(root);
  const seen = new Set<string>();
  for (const source of local) {
    seen.add(source.path);
    printSource(source);
  }

  const config = resolveConfig();
  const activeRepoId = await getActiveRepoId();
  if (!activeRepoId) {
    if (local.length === 0) console.log("No sources found.");
    return;
  }

  const repo = await getRepo(config, activeRepoId);
  const response = await piroFetch(
    config,
    `/api/repos/${encodeURIComponent(repo.id)}/sources`,
  );
  if (response.ok) {
    const body = response.body as { sources?: SourceSummary[] };
    for (const source of body.sources ?? []) {
      if (seen.has(source.path)) continue;
      printSource({ ...source, repository: repo.id });
    }
  }
  if (local.length === 0 && !response.ok) fail(response.status, response.body, "source listing failed");
}

export async function sourcesGet(name: string, root = process.cwd()): Promise<void> {
  const local = (await discoverLocalSources(root)).find((source) => source.name === name || source.path === name);
  if (local) {
    console.log(JSON.stringify(local, null, 2));
    return;
  }

  const config = resolveConfig();
  const repoId = await getActiveRepoId();
  if (!repoId) fail(400, { error: "source not found locally and no active repository is configured" }, "source lookup failed");
  const response = await piroFetch(
    config,
    `/api/repos/${encodeURIComponent(repoId)}/sources/${encodeURIComponent(name)}`,
  );
  if (!response.ok) fail(response.status, response.body, "source lookup failed");
  console.log(JSON.stringify(response.body, null, 2));
}

export async function sourcesGenerate(name: string, root = process.cwd()): Promise<void> {
  const local = (await discoverLocalSources(root)).find((source) => source.name === name || source.path === name);
  const config = resolveConfig();
  const repoId = await getActiveRepoId();
  if (!repoId) fail(400, { error: "an active repository is required to generate a dataset" }, "generation failed");
  const sourcePath = local?.path ?? name;
  const response = await piroFetch(
    config,
    `/api/repos/${encodeURIComponent(repoId)}/sources/${encodeURIComponent(sourcePath)}/generate`,
    { method: "POST" },
  );
  if (!response.ok) fail(response.status, response.body, "generation failed");
  console.log(JSON.stringify(response.body, null, 2));
}
