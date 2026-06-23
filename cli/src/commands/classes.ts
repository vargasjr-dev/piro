import { readFile, writeFile } from "node:fs/promises";
import { piroFetch, resolveConfig } from "../client.js";

export async function classesSerialize(id: string, opts: { bust?: boolean }) {
  const config = resolveConfig();
  const qs = opts.bust ? "?bust=true" : "";
  const { ok, status, body } = await piroFetch(
    config,
    `/api/classes/${id}/serialize${qs}`,
  );

  if (ok) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  // Surface the full detail from our proxy route
  const err = body as Record<string, unknown> | null;
  const detail = err?.detail ?? err?.error ?? body;
  console.error(`Error ${status}: ${err?.error ?? "serialize failed"}`);
  if (detail && detail !== err?.error) {
    console.error("\n" + String(detail));
  }
  process.exit(1);
}

export async function classesPull(id: string, opts: { out?: string }) {
  const config = resolveConfig();
  const outFile = opts.out ?? "model.py";

  const { ok, status, body } = await piroFetch(
    config,
    `/api/classes/${id}/file?path=model.py`,
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

export async function classesPush(id: string, opts: { file?: string }) {
  const config = resolveConfig();
  const inFile = opts.file ?? "model.py";

  let content: string;
  try {
    content = await readFile(inFile, "utf-8");
  } catch {
    console.error(`Error: could not read file: ${inFile}`);
    process.exit(1);
  }

  const { ok, status, body } = await piroFetch(
    config,
    `/api/classes/${id}/file`,
    {
      method: "PUT",
      body: JSON.stringify({ path: "model.py", content }),
    },
  );

  if (!ok) {
    const err = body as Record<string, unknown> | null;
    console.error(`Error ${status}: ${err?.error ?? "push failed"}`);
    process.exit(1);
  }

  const { size } = body as { size: number };
  console.log(`Pushed ${size.toLocaleString()} bytes from ${inFile} → class ${id}`);
}
