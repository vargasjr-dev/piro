import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { modelClass } from "../../../../data/schema";
import { r2PutText } from "~/lib/r2";

// ── POST /api/classes ─────────────────────────────────────────────────────────
// Accepts multipart FormData:
//   name        string (required)
//   slug        string (required)
//   description string (optional)
//   module      File   (optional .py source — uploaded to R2)
//
// Returns { id, slug } on 201.

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const name = (form.get("name") as string | null)?.trim();
  const slug = (form.get("slug") as string | null)?.trim();
  const description = (form.get("description") as string | null)?.trim() || null;
  const moduleFile = form.get("module") as File | null;

  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (!slug) return Response.json({ error: "slug is required" }, { status: 400 });
  if (!/^[a-z0-9-]+$/.test(slug))
    return Response.json({ error: "slug must be lowercase letters, numbers, and hyphens only" }, { status: 400 });

  const id = randomUUID();

  try {
    await db.insert(modelClass).values({
      id,
      userId: session.user.id,
      name,
      slug,
      description,
      parameterCount: null,
      configJson: null,
      moduleR2Key: null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("mc_user_slug") || msg.includes("unique")) {
      return Response.json({ error: "A class with that slug already exists" }, { status: 409 });
    }
    throw e;
  }

  // If a .py file was provided, upload to R2 and stamp moduleR2Key
  if (moduleFile && moduleFile.size > 0) {
    const source = await moduleFile.text();
    const r2Key = `classes/${id}`;

    // Upload the Python source
    await r2PutText(`${r2Key}/model.py`, source, "text/x-python; charset=utf-8");

    // Generate a minimal manifest from the form fields (no Python execution on Vercel)
    const manifest = {
      name,
      slug,
      description: description ?? "",
      hyperparams: {},
      parameterCount: null,
      module: null,
      modelClass: null,
      configClass: null,
    };
    await r2PutText(`${r2Key}/manifest.json`, JSON.stringify(manifest, null, 2), "application/json; charset=utf-8");

    await db.update(modelClass).set({ moduleR2Key: r2Key }).where(eq(modelClass.id, id));
  }

  return Response.json({ id, slug }, { status: 201 });
}

// ── GET /api/classes ──────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const classes = await db
    .select()
    .from(modelClass)
    .where(eq(modelClass.userId, session.user.id));

  return Response.json({ classes });
}
