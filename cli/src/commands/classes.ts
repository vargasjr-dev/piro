import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { piroFetch, resolveConfig } from "../client.js";
import {
  classFileResponseSchema,
  classSizeResponseSchema,
  errorMessage,
} from "../response-schemas.js";

const classErrorSchema = z
  .object({ detail: z.unknown().optional(), error: z.string().optional() })
  .passthrough();

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

  const detail = (() => {
    const parsed = classErrorSchema.safeParse(body);
    return parsed.success ? (parsed.data.detail ?? parsed.data.error) : body;
  })();
  console.error(`Error ${status}: ${errorMessage(body, "serialize failed")}`);
  if (detail && detail !== errorMessage(body, "serialize failed")) {
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
    console.error(`Error ${status}: ${errorMessage(body, "pull failed")}`);
    process.exit(1);
  }

  const parsed = classFileResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Error 502: pull response was invalid");
    process.exit(1);
  }

  const { content, truncated, size } = parsed.data;
  await writeFile(outFile, content, "utf-8");
  console.log(`Pulled ${size.toLocaleString()} bytes → ${outFile}`);
  if (truncated) console.warn("Warning: file was truncated at 100 KB.");
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
    { method: "PUT", body: JSON.stringify({ path: "model.py", content }) },
  );
  if (!ok) {
    console.error(`Error ${status}: ${errorMessage(body, "push failed")}`);
    process.exit(1);
  }

  const parsed = classSizeResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Error 502: push response was invalid");
    process.exit(1);
  }
  console.log(
    `Pushed ${parsed.data.size.toLocaleString()} bytes from ${inFile} → class ${id}`,
  );
}
