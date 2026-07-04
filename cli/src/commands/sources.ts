import { readFile, writeFile } from "node:fs/promises";
import { piroFetch, resolveConfig } from "../client.js";

/**
 * Pull / push the data source's generator script — mirrors `piro classes pull/push`
 * but targets the data-source `script.py` instead of the class `model.py`.
 *
 * Why script.py only?
 *   The source's `r2Prefix` (data/train.jsonl, metadata.json, etc.) is produced
 *   by generate-source.mjs, not authored by hand. The script is the only file
 *   worth round-tripping through git/version control.
 */

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