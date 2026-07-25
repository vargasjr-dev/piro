/**
 * scripts/seed-class-modules.ts
 *
 * Uploads the two built-in model class Python modules to R2 and stamps
 * the model_class DB rows with moduleR2Key + manifest.json.
 *
 * Run once (idempotent — safe to re-run):
 *   DATABASE_URL=... BUCKET_ENDPOINT_URL=... BUCKET_KEY_ID=... BUCKET_APPLICATION_SECRET=... \
 *   bun run scripts/seed-class-modules.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { eq, and } from "drizzle-orm";

// ── Bootstrap env from .env.local if present ──────────────────────────────────
const envPath = join(import.meta.dir, "../.env.local");
try {
  const envText = readFileSync(envPath, "utf-8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // No .env.local — assume env vars are already set
}

// ── Imports that need env vars ────────────────────────────────────────────────
const { db } = await import("../data/db");
const { modelClass } = await import("../data/schema");
const { r2PutText } = await import("../src/lib/r2");

// ── Module definitions ────────────────────────────────────────────────────────

interface ClassManifest {
  name: string;
  slug: string;
  description: string;
  hyperparams: Record<string, number | string | boolean>;
  parameterCount: number;
  module: string;
  modelClass: string;
}

const MODULES: Array<{
  slug: string;
  sourcePath: string;
  manifest: ClassManifest;
}> = [
  {
    slug: "ctm",
    sourcePath: join(import.meta.dir, "../architectures/ctm/model.py"),
    manifest: {
      name: "Continuous Thought Model",
      slug: "ctm",
      description:
        "Iterative tick-loop architecture with sync-driven attention. " +
        "Neuron state accumulates across ticks before committing to an output — " +
        "trades parameter efficiency for internal reasoning depth.",
      hyperparams: {
        n_neurons: 4,
        embed_dim: 8,
        query_dim: 8,
        value_dim: 8,
        hidden_dim: 16,
        n_classes: 5,
        window_size: 8,
        max_ticks: 10,
        enable_burst: false,
        enable_plasticity: false,
        enable_oscillation: false,
        confidence_threshold: 0.9,
      },
      parameterCount: 1674,
      module: "architectures.ctm.model",
      modelClass: "ContinuousThoughtModel",
    },
  },
  {
    slug: "baseline-transformer",
    sourcePath: join(import.meta.dir, "../architectures/baseline_transformer/model.py"),
    manifest: {
      name: "Baseline Transformer",
      slug: "baseline-transformer",
      description:
        "2-layer pre-norm transformer with multi-head self-attention. " +
        "Mean-pools the final layer to produce a single classification output. " +
        "Standard baseline for sequence tasks.",
      hyperparams: {
        embed_dim: 8,
        n_heads: 2,
        ffn_dim: 6,
        n_layers: 2,
        n_classes: 5,
      },
      parameterCount: 857,
      module: "architectures.baseline_transformer.model",
      modelClass: "BaselineTransformer",
    },
  },
];

// ── Find the single user (or require USER_ID) ─────────────────────────────────
const { user } = await import("../data/schema");
const users = await db
  .select({ id: user.id, email: user.email })
  .from(user)
  .limit(10);

if (users.length === 0) {
  console.error("No users found in DB. Seed aborted.");
  process.exit(1);
}

// Use USER_ID env var or the first user
const userId = process.env.USER_ID ?? users[0].id;
console.log(
  `Seeding for user ${userId} (${users.find((u) => u.id === userId)?.email ?? "?"})`,
);

// ── Upload + update ───────────────────────────────────────────────────────────

for (const def of MODULES) {
  // Find the DB row for this class
  const [cls] = await db
    .select()
    .from(modelClass)
    .where(and(eq(modelClass.userId, userId), eq(modelClass.slug, def.slug)))
    .limit(1);

  if (!cls) {
    console.warn(`  [skip] No model_class row found for slug="${def.slug}"`);
    continue;
  }

  const r2Key = `classes/${cls.id}`;

  // Read the Python source
  const source = readFileSync(def.sourcePath, "utf-8");

  // Upload model.py
  await r2PutText(`${r2Key}/model.py`, source, "text/x-python; charset=utf-8");
  console.log(`  [ok] Uploaded ${r2Key}/model.py (${source.length} bytes)`);

  // Upload manifest.json
  const manifestJson = JSON.stringify(def.manifest, null, 2);
  await r2PutText(
    `${r2Key}/manifest.json`,
    manifestJson,
    "application/json; charset=utf-8",
  );
  console.log(`  [ok] Uploaded ${r2Key}/manifest.json`);

  // Stamp the DB row
  await db
    .update(modelClass)
    .set({ moduleR2Key: r2Key })
    .where(eq(modelClass.id, cls.id));
  console.log(`  [ok] model_class.moduleR2Key = "${r2Key}" for "${cls.name}"`);
}

console.log("\nDone.");
process.exit(0);
