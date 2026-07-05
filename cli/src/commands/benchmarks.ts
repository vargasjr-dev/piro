import { readFile, writeFile } from "node:fs/promises";
import { piroFetch, resolveConfig } from "../client.js";

/**
 * Create / list / pull / push benchmarks — mirrors `piro sources` pattern.
 *
 *   piro benchmarks create <id> --name <name> [--source <source-id>] [--description ...]
 *   piro benchmarks list
 *   piro benchmarks pull <id> [--out <file>]
 *   piro benchmarks push <id> [--file <file>]
 *
 * The benchmark's eval script (script.py) is the only file worth
 * round-tripping through git. R2 prefix and scriptR2Key are auto-set on create.
 */

interface BenchmarkSummary {
  id: string;
  name: string;
  description: string | null;
  dataSourceId: string | null;
  dataSourceName: string | null;
  hasScript: boolean;
  createdAt: string;
}

export async function benchmarksList() {
  const config = resolveConfig();

  const { ok, status, body } = await piroFetch(config, "/api/benchmarks");

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "list failed"}`);
    process.exit(1);
  }

  const { benchmarks } = body as { benchmarks: BenchmarkSummary[] };

  if (benchmarks.length === 0) {
    console.log("No benchmarks found.");
    return;
  }

  for (const b of benchmarks) {
    const ds = b.dataSourceName ? `  src: ${b.dataSourceName}` : "";
    const script = b.hasScript ? "" : "  (no script)";
    console.log(`${b.id}  ${b.name}${ds}${script}`);
  }
}

export async function benchmarksCreate(
  id: string,
  opts: { name: string; source?: string; description?: string },
) {
  const config = resolveConfig();

  const payload: Record<string, unknown> = {
    id,
    name: opts.name,
  };
  if (opts.source) payload.dataSourceId = opts.source;
  if (opts.description) payload.description = opts.description;

  const { ok, status, body } = await piroFetch(config, "/api/benchmarks", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "create failed"}`);
    process.exit(1);
  }

  console.log(`Created benchmark: ${id}`);
}

export async function benchmarksPull(id: string, opts: { out?: string }) {
  const config = resolveConfig();
  const outFile = opts.out ?? "benchmark.py";

  const { ok, status, body } = await piroFetch(
    config,
    `/api/benchmarks/${id}/file?path=script.py`,
  );

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "pull failed"}`);
    process.exit(1);
  }

  const { content, truncated, size } = body as {
    content: string;
    truncated: boolean;
    size: number;
  };

  await writeFile(outFile, content, "utf-8");
  console.log(`Pulled ${size.toLocaleString()} bytes → ${outFile}`);
  if (truncated) {
    console.warn("Warning: file was truncated at 100 KB.");
  }
}

export async function benchmarksPush(id: string, opts: { file?: string }) {
  const config = resolveConfig();
  const inFile = opts.file ?? "benchmark.py";

  let content: string;
  try {
    content = await readFile(inFile, "utf-8");
  } catch {
    console.error(`Error: could not read file: ${inFile}`);
    process.exit(1);
  }

  const { ok, status, body } = await piroFetch(
    config,
    `/api/benchmarks/${id}/file`,
    {
      method: "PUT",
      body: JSON.stringify({ path: "script.py", content }),
    },
  );

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "push failed"}`);
    process.exit(1);
  }

  const { size } = body as { size: number };
  console.log(`Pushed ${size.toLocaleString()} bytes from ${inFile} → benchmark ${id}`);
}
