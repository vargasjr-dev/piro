import { readFile, writeFile } from "node:fs/promises";
import { piroFetch, resolveConfig } from "../client.js";

/**
 * Create / pull / push data sources — mirrors `piro classes` pattern.
 *
 *   piro sources create <id> --name "Counter Sequences" [--description "..."]
 *   piro sources pull <id> [--out <file>]
 *   piro sources push <id> [--file <file>]
 *
 * Why script.py only for pull/push?
 *   The source's `r2Prefix` (data/train.jsonl, metadata.json, etc.) is produced
 *   by generate-source.mjs, not authored by hand. The script is the only file
 *   worth round-tripping through git/version control.
 */

export async function sourcesCreate(
  id: string,
  opts: { name: string; description?: string; sampleCount?: number },
) {
  const config = resolveConfig();

  const payload: Record<string, unknown> = {
    id,
    name: opts.name,
  };
  if (opts.description) payload.description = opts.description;
  if (opts.sampleCount !== undefined) payload.sampleCount = opts.sampleCount;

  const { ok, status, body } = await piroFetch(config, "/api/data-sources", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "create failed"}`);
    process.exit(1);
  }

  const { id: createdId } = body as { id: string };
  console.log(`Created data source: ${createdId}`);
  if (createdId !== id) {
    console.log(`  (requested id "${id}", got "${createdId}")`);
  }
}

export async function sourcesPull(id: string, opts: { out?: string }) {
  const config = resolveConfig();
  const outFile = opts.out ?? "script.py";

  const { ok, status, body } = await piroFetch(
    config,
    `/api/data-sources/${id}/file?path=script.py`,
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
    console.warn("Warning: file was truncated at 50 KB.");
  }
}

export async function sourcesPush(id: string, opts: { file?: string }) {
  const config = resolveConfig();
  const inFile = opts.file ?? "script.py";

  let content: string;
  try {
    content = await readFile(inFile, "utf-8");
  } catch {
    console.error(`Error: could not read file: ${inFile}`);
    process.exit(1);
  }

  const { ok, status, body } = await piroFetch(
    config,
    `/api/data-sources/${id}/file`,
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
  console.log(`Pushed ${size.toLocaleString()} bytes from ${inFile} → source ${id}`);
}