#!/usr/bin/env node
/**
 * scripts/generate-source.mjs
 *
 * Pre-generates a data source and uploads files to R2.
 * Updates the data_source row in the DB with r2Prefix, scriptR2Key,
 * sampleCount, and generatedAt.
 *
 * Usage:
 *   node scripts/generate-source.mjs [--source sorting-sequences]
 *
 * Requires env vars:
 *   DATABASE_URL         — Neon connection string
 *   BUCKET_ENDPOINT_URL  — R2/B2 S3-compatible endpoint
 *   BUCKET_KEY_ID        — Access key ID
 *   BUCKET_APPLICATION_SECRET — Secret access key
 */

import { neon } from "@neondatabase/serverless";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const sourceIdArg = args[args.indexOf("--source") + 1] ?? "sorting-sequences";

// ── Env ───────────────────────────────────────────────────────────────────────

// Load .env.local if present (for local runs)
try {
  const envLocal = readFileSync(resolve(repoRoot, ".env.local"), "utf-8");
  for (const line of envLocal.split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim();
    }
  }
} catch {
  // No .env.local — rely on environment
}

const { DATABASE_URL, BUCKET_ENDPOINT_URL, BUCKET_KEY_ID, BUCKET_APPLICATION_SECRET } = process.env;

for (const [name, val] of [
  ["DATABASE_URL", DATABASE_URL],
  ["BUCKET_ENDPOINT_URL", BUCKET_ENDPOINT_URL],
  ["BUCKET_KEY_ID", BUCKET_KEY_ID],
  ["BUCKET_APPLICATION_SECRET", BUCKET_APPLICATION_SECRET],
]) {
  if (!val) {
    console.error(`ERROR: ${name} is not set`);
    process.exit(1);
  }
}

// ── DB + R2 clients ───────────────────────────────────────────────────────────

const sql = neon(DATABASE_URL);

const r2 = new S3Client({
  region: "auto",
  endpoint: BUCKET_ENDPOINT_URL.startsWith("http")
    ? BUCKET_ENDPOINT_URL
    : `https://${BUCKET_ENDPOINT_URL}`,
  credentials: { accessKeyId: BUCKET_KEY_ID, secretAccessKey: BUCKET_APPLICATION_SECRET },
  forcePathStyle: true,
});

const BUCKET = "piro-kb";

async function r2Upload(key, body, contentType) {
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

// ── Source config ─────────────────────────────────────────────────────────────

const SOURCE_CONFIGS = {
  "sorting-sequences": {
    scriptPath: "model/data/sequences.py",
    module: "model.data.sequences",
    trainArgs: ["--split", "train", "--n", "5000", "--seed", "42"],
    trainCount: 5000,
  },
  "counter-sequences": {
    scriptPath: "model/data/counter.py",
    module: "model.data.counter",
    trainArgs: [
      "--split", "train",
      "--n", "50000",
      "--length-min", "2",
      "--length-max", "8",
      "--seed", "42",
    ],
    trainCount: 50000,
  },
};

const config = SOURCE_CONFIGS[sourceIdArg];
if (!config) {
  console.error(`Unknown source: ${sourceIdArg}. Known: ${Object.keys(SOURCE_CONFIGS).join(", ")}`);
  process.exit(1);
}

// ── Look up DB row ────────────────────────────────────────────────────────────

console.log(`\nGenerating source: ${sourceIdArg}`);

const rows = await sql`SELECT id, "userId" FROM data_source WHERE id = ${sourceIdArg} LIMIT 1`;
if (rows.length === 0) {
  console.error(`data_source row not found for id='${sourceIdArg}'. Run the database migration workflow first.`);
  process.exit(1);
}

const { userId } = rows[0];
const r2Prefix = `sources/${sourceIdArg}/`;
const scriptR2Key = `${userId}/${r2Prefix}script.py`;

// ── Run Python generator ──────────────────────────────────────────────────────

function runPython(extraArgs) {
  const result = spawnSync(
    "python3",
    ["-m", config.module, ...extraArgs],
    { cwd: repoRoot, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error("Python error:", result.stderr);
    process.exit(1);
  }
  // Filter out RuntimeWarning lines
  return result.stdout
    .split("\n")
    .filter((l) => l.trim() && !l.includes("RuntimeWarning"))
    .join("\n");
}

console.log(`  Generating train split (${config.trainCount} samples)…`);
const trainJsonl = runPython(config.trainArgs);
console.log(`  ✓ ${trainJsonl.split("\n").filter(Boolean).length} train samples`);

// ── Build metadata.json ───────────────────────────────────────────────────────

const metadata = {
  id: sourceIdArg,
  generatedAt: new Date().toISOString(),
  trainCount: config.trainCount,
  seed: 42,
  note: "No test split — benchmarks define their own eval datasets.",
  scriptPath: config.scriptPath,
};

// ── Upload to R2 ─────────────────────────────────────────────────────────────

console.log("\n  Uploading to R2…");

const dataPrefix = `${userId}/${r2Prefix}data/`;

await r2Upload(`${dataPrefix}train.jsonl`, trainJsonl, "application/x-ndjson");
console.log(`  ✓ ${userId}/${r2Prefix}data/train.jsonl`);

await r2Upload(`${dataPrefix}metadata.json`, JSON.stringify(metadata, null, 2), "application/json");
console.log(`  ✓ ${userId}/${r2Prefix}data/metadata.json`);

const scriptContent = readFileSync(resolve(repoRoot, config.scriptPath), "utf-8");
await r2Upload(scriptR2Key, scriptContent, "text/x-python");
console.log(`  ✓ ${scriptR2Key}`);

// ── Update DB ─────────────────────────────────────────────────────────────────

await sql`
  UPDATE data_source
  SET
    "r2Prefix"    = ${r2Prefix},
    "scriptR2Key" = ${scriptR2Key},
    "sampleCount" = ${config.trainCount},
    "generatedAt" = NOW()
  WHERE id = ${sourceIdArg}
`;

console.log(`\n✅ Done. DB updated for '${sourceIdArg}'.`);
console.log(`   R2 prefix: ${userId}/${r2Prefix}`);
console.log(`   Total samples: ${config.trainCount}`);
