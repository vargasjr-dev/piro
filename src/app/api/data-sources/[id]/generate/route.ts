import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { dataSource } from "../../../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { r2PutText } from "~/lib/r2";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

/**
 * POST /api/data-sources/[id]/generate
 *
 * Generates data for a synthetic source and uploads it to R2.
 * Runs the generator inline (pure JS, no subprocess).
 *
 * Currently supports: sorting-sequences, counter-sequences
 * Accepts session cookie or Bearer API key.
 */

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

// ── Seeded RNG (LCG) ──────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

// ── Generator configs ─────────────────────────────────────────────────────────
// Each config knows how to produce train JSONL + metadata for a source.
// The key is the source id (e.g. "sorting-sequences", "counter-sequences").

interface GeneratorConfig {
  trainCount: number;
  seed: number;
  generate: (rng: () => number, split: string) => string[]; // returns JSONL lines
  metadata: (generatedAt: string) => Record<string, unknown>;
}

const GENERATORS: Record<string, GeneratorConfig> = {
  "sorting-sequences": {
    trainCount: 5000,
    seed: 42,
    generate(rng, split) {
      const lines: string[] = [];
      const n = 5000;
      const seqLen = 4;
      for (let i = 0; i < n; i++) {
        const seq = Array.from({ length: seqLen }, () => Math.floor(rng() * 1000));
        const sorted = [...seq].sort((a, b) => a - b);
        lines.push(
          JSON.stringify({
            prompt: `Sort the following numbers in ascending order.\nReply with only the sorted numbers separated by spaces, nothing else.\n\n${seq.join(" ")}`,
            label: sorted.join(" "),
            metadata: { split, index: i, seed: 42 },
          }),
        );
      }
      return lines;
    },
    metadata(generatedAt) {
      return {
        id: "sorting-sequences",
        generatedAt,
        trainCount: 5000,
        seed: 42,
        sequenceLength: 4,
        task: "sort-ascending",
        note: "No test split — benchmarks define their own eval datasets.",
        scriptPath: "model/data/sequences.py",
      };
    },
  },
  "counter-sequences": {
    trainCount: 50_000,
    seed: 42,
    generate(rng, split) {
      const lines: string[] = [];
      const n = 50_000;
      for (let i = 0; i < n; i++) {
        // Length sampled uniformly in [2, 8]
        const seqLen = 2 + Math.floor(rng() * 7);
        const ops: string[] = [];
        for (let j = 0; j < seqLen; j++) {
          ops.push(rng() < 0.5 ? "INC" : "DEC");
        }
        const count = ops.reduce((acc, op) => acc + (op === "INC" ? 1 : -1), 0);
        const label = count < 0 ? `-${-count}` : count > 0 ? `+${count}` : "0";
        lines.push(
          JSON.stringify({
            prompt: ops.join(" "),
            label,
            metadata: { split, index: i, seed: 42, length: seqLen },
          }),
        );
      }
      return lines;
    },
    metadata(generatedAt) {
      return {
        id: "counter-sequences",
        generatedAt,
        trainCount: 50_000,
        seed: 42,
        lengthRange: [2, 8],
        task: "sequential-counter",
        note: "No test split — benchmarks define their own eval datasets.",
        scriptPath: "model/data/counter.py",
      };
    },
  },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [source] = await db
    .select()
    .from(dataSource)
    .where(and(eq(dataSource.id, id), eq(dataSource.userId, userId)))
    .limit(1);

  if (!source) return Response.json({ error: "Not found" }, { status: 404 });
  if (source.type !== "synthetic") {
    return Response.json({ error: "Only synthetic sources can be generated" }, { status: 400 });
  }

  const gen = GENERATORS[id];
  if (!gen) {
    return Response.json({ error: `Generator not implemented for source: ${id}` }, { status: 400 });
  }

  // ── Generate ─────────────────────────────────────────────────────────────────
  const rng = seededRandom(gen.seed);
  const trainLines = gen.generate(rng, "train");
  const trainJsonl = trainLines.join("\n");

  const r2Prefix = `sources/${id}/`;
  const dataPrefix = `${userId}/${r2Prefix}data/`;
  const scriptR2Key = `${userId}/${r2Prefix}script.py`;

  const generatedAt = new Date().toISOString();
  const metadata = gen.metadata(generatedAt);

  // Upload data files
  await r2PutText(`${dataPrefix}train.jsonl`, trainJsonl, "application/x-ndjson");
  await r2PutText(`${dataPrefix}metadata.json`, JSON.stringify(metadata, null, 2), "application/json");

  // Update DB
  await db
    .update(dataSource)
    .set({
      r2Prefix,
      scriptR2Key,
      sampleCount: gen.trainCount,
      generatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dataSource.id, id));

  return Response.json({ ok: true, sampleCount: gen.trainCount });
}
