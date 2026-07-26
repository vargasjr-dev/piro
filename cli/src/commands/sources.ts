import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { errorMessage, sourceSummarySchema } from "../response-schemas.js";

const sourceSelectionSchema = z.object({
  name: z.string(),
  path: z.string(),
  entrypoint: z.string().nullable(),
  experiment: z.string().nullable().optional(),
});
type SourceSummary = z.infer<typeof sourceSummarySchema>;

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
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
    for (const experiment of await readdir(experimentsRoot, {
      withFileTypes: true,
    })) {
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
    for (const source of await readdir(rootEntry.path, {
      withFileTypes: true,
    })) {
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

function printSource(source: SourceSummary): void {
  const scope = source.experiment ? ` [${source.experiment}]` : "";
  console.log(
    `${source.name}${scope}  ${source.path}${source.entrypoint ? `/${source.entrypoint}` : ""}`,
  );
}

export async function sourcesList(root = process.cwd()): Promise<void> {
  const sources = await discoverLocalSources(root);
  if (sources.length === 0) {
    console.log("No sources found.");
    return;
  }
  for (const source of sources) printSource(source);
}

export async function sourcesGet(
  name: string,
  root = process.cwd(),
): Promise<void> {
  const source = (await discoverLocalSources(root)).find(
    (candidate) => candidate.name === name || candidate.path === name,
  );
  if (!source) {
    fail(404, { error: `source not found in ${root}` }, "source lookup failed");
  }
  console.log(JSON.stringify(sourceSelectionSchema.parse(source), null, 2));
}
