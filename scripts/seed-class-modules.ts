/**
 * Upload the built-in architecture modules and manifests to R2, then attach
 * each object prefix to its matching model_class row. The operation is
 * idempotent and safe to run again after changing a checked-in module.
 *
 * Required environment: DATABASE_URL, BUCKET_ENDPOINT_URL, BUCKET_KEY_ID,
 * and BUCKET_APPLICATION_SECRET. USER_ID selects the owner when needed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { discoverArchitectureEntrypoints } from "./architecture-discovery";

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

// Built-in classes are stored as source modules plus manifests under one R2 prefix per class.

const architectureManifestSchema = z.object({
  entrypointPath: z.string(),
  sourcePath: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  hyperparams: z.record(z.string(), z.unknown()),
  parameterCount: z.number().int().nonnegative(),
  module: z.string(),
  modelClass: z.string(),
});

type ClassManifest = z.infer<typeof architectureManifestSchema>;

const repositoryRoot = join(import.meta.dir, "..");
const architectureEntrypoints = discoverArchitectureEntrypoints(
  join(repositoryRoot, "architectures"),
);
const discoveredManifests = architectureManifestSchema
  .array()
  .parse(
    JSON.parse(
      execFileSync(
        "python3",
        [join(import.meta.dir, "architecture-manifests.py")],
        { cwd: repositoryRoot, encoding: "utf8" },
      ),
    ),
  );
const manifestsByEntrypoint = new Map(
  discoveredManifests.map((manifest) => [manifest.entrypointPath, manifest]),
);
const MODULES = architectureEntrypoints.map((entrypointPath) => {
  const relativeEntrypoint = entrypointPath.slice(repositoryRoot.length + 1);
  const manifest = manifestsByEntrypoint.get(relativeEntrypoint);
  if (!manifest) {
    throw new Error(`No manifest discovered for ${relativeEntrypoint}`);
  }
  return {
    slug: manifest.slug,
    sourcePath: join(repositoryRoot, manifest.sourcePath),
    manifest,
  };
});

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
  // Match the checked-in class definition to the owner's model_class row.
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

  // Upload the source and manifest used by the runtime loader.
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
