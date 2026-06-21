/**
 * GET /api/admin/seed-class-modules
 *
 * Idempotent seed: for each built-in model class, uploads the Python source
 * (model.py) and manifest (manifest.json) to R2, then stamps the model_class
 * row with moduleR2Key.
 *
 * Manifest is read from model/{slug}.manifest.json — the canonical JSON
 * generated from each class's serialize() method and committed to the repo.
 * model.py is read from model/{slug-to-path}.py.
 *
 * Add ?force=true to re-upload even if already seeded (e.g. after manifest
 * changes like adding a new graph field).
 *
 * Requires an active session OR a Bearer API key.
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

const MODULES: Array<{ slug: string; sourcePath: string; manifestPath: string }> = [
  {
    slug: "ctm",
    sourcePath: "model/ctm.py",
    manifestPath: "model/ctm.manifest.json",
  },
  {
    slug: "baseline-transformer",
    sourcePath: "model/baseline_transformer.py",
    manifestPath: "model/baseline_transformer.manifest.json",
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

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  // Ensure built-in classes exist
  let classes = await db
    .select()
    .from(modelClass)
    .where(eq(modelClass.userId, userId));

  if (classes.length === 0) {
    await db.insert(modelClass).values(buildDefaultClasses(userId));
    classes = await db
      .select()
      .from(modelClass)
      .where(eq(modelClass.userId, userId));
  }

  const results: Array<{
    slug: string;
    status: string;
    r2Key?: string;
    error?: string;
  }> = [];

  for (const def of MODULES) {
    // Without force: skip rows that already have a module key
    if (!force) {
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
    }

    // Look up the row (may or may not have moduleR2Key)
    const [cls] = await db
      .select()
      .from(modelClass)
      .where(and(eq(modelClass.userId, userId), eq(modelClass.slug, def.slug)))
      .limit(1);

    if (!cls) {
      results.push({ slug: def.slug, status: "not_found" });
      continue;
    }

    try {
      const r2Key = `classes/${cls.id}`;
      const cwd = process.cwd();

      // Read Python source
      const source = readFileSync(join(cwd, def.sourcePath), "utf-8");

      // Read manifest JSON (canonical, generated from serialize())
      const manifest = readFileSync(join(cwd, def.manifestPath), "utf-8");

      // Upload model.py
      await r2PutText(
        `${r2Key}/model.py`,
        source,
        "text/x-python; charset=utf-8",
      );

      // Upload manifest.json
      await r2PutText(
        `${r2Key}/manifest.json`,
        manifest,
        "application/json; charset=utf-8",
      );

      // Stamp the DB row
      await db
        .update(modelClass)
        .set({ moduleR2Key: r2Key })
        .where(eq(modelClass.id, cls.id));

      results.push({
        slug: def.slug,
        status: force ? "reseeded" : "seeded",
        r2Key,
      });
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
