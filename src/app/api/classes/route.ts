import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { modelClass } from "../../../../data/schema";
import { eq, asc } from "drizzle-orm";
import { buildDefaultClasses } from "~/lib/model-classes";

// ── GET /api/classes ──────────────────────────────────────────────────────────
// Returns the authenticated user's model classes, ordered by creation time.
// Lazy-seeds the two built-in classes (CTM + Baseline Transformer) if the user
// has no classes yet — happens automatically on first visit to /classes.

// ── GET /api/classes ──────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  let classes = await db
    .select()
    .from(modelClass)
    .where(eq(modelClass.userId, userId))
    .orderBy(asc(modelClass.createdAt));

  // First-time seed: insert default classes if the user has none
  if (classes.length === 0) {
    const defaults = buildDefaultClasses(userId);
    await db.insert(modelClass).values(defaults);
    classes = await db
      .select()
      .from(modelClass)
      .where(eq(modelClass.userId, userId))
      .orderBy(asc(modelClass.createdAt));
  }

  return Response.json({
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? null,
      parameterCount: c.parameterCount ?? null,
      configJson: c.configJson ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
