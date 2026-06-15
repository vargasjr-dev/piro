import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { dataSource } from "../../../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { r2PutText } from "~/lib/r2";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * POST /api/data-sources/[id]/generate
 *
 * Generates data for a synthetic source and uploads it to R2.
 * Runs the generator inline (no subprocess) using pure-JS implementations.
 *
 * Currently supports: sorting-sequences
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [source] = await db
    .select()
    .from(dataSource)
    .where(and(eq(dataSource.id, id), eq(dataSource.userId, session.user.id)))
    .limit(1);

  if (!source) return Response.json({ error: "Not found" }, { status: 404 });
  if (source.type !== "synthetic") {
    return Response.json({ error: "Only synthetic sources can be generated" }, { status: 400 });
  }

  if (id !== "sorting-sequences") {
    return Response.json({ error: `Generator not implemented for source: ${id}` }, { status: 400 });
  }

  // ── Generate sorting-sequences inline ────────────────────────────────────────

  const TRAIN_N = 5000;
  const SEQ_LEN = 4;
  const SEED = 42;

  function seededRandom(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0x100000000;
    };
  }

  function generateSample(seq: number[], split: string, index: number, seed: number) {
    const sorted = [...seq].sort((a, b) => a - b);
    return {
      prompt: `Sort the following numbers in ascending order.\nReply with only the sorted numbers separated by spaces, nothing else.\n\n${seq.join(" ")}`,
      label: sorted.join(" "),
      metadata: { split, index, seed },
    };
  }

  function generateDataset(n: number, seed: number, split: string): string {
    const rng = seededRandom(seed + (split === "test" ? 999983 : 0));
    const lines: string[] = [];
    for (let i = 0; i < n; i++) {
      const seq = Array.from({ length: SEQ_LEN }, () => Math.floor(rng() * 1000));
      lines.push(JSON.stringify(generateSample(seq, split, i, seed)));
    }
    return lines.join("\n");
  }

  const trainJsonl = generateDataset(TRAIN_N, SEED, "train");

  const r2Prefix = `sources/${id}/`;
  const dataPrefix = `${session.user.id}/${r2Prefix}data/`;
  const scriptR2Key = `${session.user.id}/${r2Prefix}script.py`;

  const metadata = {
    id,
    generatedAt: new Date().toISOString(),
    trainCount: TRAIN_N,
    seed: SEED,
    sequenceLength: SEQ_LEN,
    task: "sort-ascending",
    note: "No test split — benchmarks define their own eval datasets.",
    scriptPath: "model/data/sequences.py",
  };

  // Upload data files
  await r2PutText(`${dataPrefix}train.jsonl`, trainJsonl, "application/x-ndjson");
  await r2PutText(`${dataPrefix}metadata.json`, JSON.stringify(metadata, null, 2), "application/json");

  // Upload the Python script (the source of truth for the generation logic)
  let scriptContent = "# Script unavailable";
  try {
    scriptContent = readFileSync(resolve(process.cwd(), "model/data/sequences.py"), "utf-8");
  } catch { /* running outside repo — leave placeholder */ }
  await r2PutText(scriptR2Key, scriptContent, "text/x-python");

  // Update DB
  await db
    .update(dataSource)
    .set({
      r2Prefix,
      scriptR2Key,
      sampleCount: TRAIN_N,
      generatedAt: new Date(),
    })
    .where(eq(dataSource.id, id));

  return Response.json({ ok: true, sampleCount: TRAIN_N });
}
