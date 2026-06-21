/**
 * GET /api/admin/seed-class-modules
 *
 * One-time idempotent seed: for each built-in model class, uploads the Python
 * source (model.py) and a pre-generated manifest (manifest.json) to R2, then
 * stamps the model_class row with moduleR2Key.
 *
 * Requires an active session. Safe to re-run — uses IF NOT EXISTS semantics
 * (only uploads when moduleR2Key is NULL on the DB row).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { modelClass } from "../../../../../data/schema";
import { eq, and, isNull } from "drizzle-orm";
import { r2PutText } from "~/lib/r2";
import { buildDefaultClasses } from "~/lib/model-classes";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

interface ClassManifest {
  name: string;
  slug: string;
  description: string;
  hyperparams: Record<string, number | string | boolean>;
  parameterCount: number;
  module: string;
  modelClass: string;
  configClass: string;
}

const MODULES: Array<{ slug: string; relPath: string; manifest: ClassManifest }> = [
  {
    slug: "ctm",
    relPath: "model/ctm.py",
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
        max_ticks: 10,
        confidence_threshold: 0.9,
      },
      parameterCount: 870,
      module: "model.ctm",
      modelClass: "ContinuousThoughtModel",
      configClass: "CTMConfig",
    },
  },
  {
    slug: "baseline-transformer",
    relPath: "model/baseline_transformer.py",
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
      module: "model.baseline_transformer",
      modelClass: "BaselineTransformer",
      configClass: "TransformerConfig",
    },
  },
];

export async function GET(request: Request) {
  // Accept either a session cookie or a Bearer API key
  let userId: string | null = null;

  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    userId = keyAuth?.userId ?? null;
  }

  if (!userId) {
    const session = await auth.api.getSession({ headers: await headers() });
    userId = session?.user.id ?? null;
  }

  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure built-in classes exist
  let classes = await db
    .select()
    .from(modelClass)
    .where(eq(modelClass.userId, userId));

  if (classes.length === 0) {
    await db.insert(modelClass).values(buildDefaultClasses(userId));
    classes = await db.select().from(modelClass).where(eq(modelClass.userId, userId));
  }

  const results: Array<{ slug: string; status: string; r2Key?: string; error?: string }> = [];

  for (const def of MODULES) {
    // Only seed rows that don't have a module yet
    const [cls] = await db
      .select()
      .from(modelClass)
      .where(
        and(
          eq(modelClass.userId, userId),
          eq(modelClass.slug, def.slug),
          isNull(modelClass.moduleR2Key),
        ),
      )
      .limit(1);

    if (!cls) {
      results.push({ slug: def.slug, status: "already_seeded" });
      continue;
    }

    try {
      const r2Key = `classes/${cls.id}`;

      // Read Python source from the deployed repo (available at process.cwd())
      const sourcePath = join(process.cwd(), def.relPath);
      const source = readFileSync(sourcePath, "utf-8");

      // Upload model.py
      await r2PutText(`${r2Key}/model.py`, source, "text/x-python; charset=utf-8");

      // Upload manifest.json
      await r2PutText(
        `${r2Key}/manifest.json`,
        JSON.stringify(def.manifest, null, 2),
        "application/json; charset=utf-8",
      );

      // Stamp the DB row
      await db
        .update(modelClass)
        .set({ moduleR2Key: r2Key })
        .where(eq(modelClass.id, cls.id));

      results.push({ slug: def.slug, status: "seeded", r2Key });
    } catch (e) {
      results.push({
        slug: def.slug,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Response.json({ ok: true, results });
}
