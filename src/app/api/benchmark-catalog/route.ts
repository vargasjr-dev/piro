import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { benchmark } from "../../../../data/schema";
import { eq, asc } from "drizzle-orm";
import { buildDefaultBenchmarks } from "~/lib/benchmark-defs";

// ── GET /api/benchmark-catalog ────────────────────────────────────────────────
// Returns the authenticated user's benchmark definitions, ordered by creation time.
// Lazy-seeds the three built-in benchmarks (SanityCheck, OODGeneralization,
// AdaptiveCompute) if the user has none yet — happens automatically on first
// call (e.g. when opening /benchmarks/new).

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  let benchmarks = await db
    .select()
    .from(benchmark)
    .where(eq(benchmark.userId, userId))
    .orderBy(asc(benchmark.createdAt));

  // First-time seed: insert default benchmarks if the user has none
  if (benchmarks.length === 0) {
    const defaults = buildDefaultBenchmarks(userId);
    await db.insert(benchmark).values(defaults);
    benchmarks = await db
      .select()
      .from(benchmark)
      .where(eq(benchmark.userId, userId))
      .orderBy(asc(benchmark.createdAt));
  }

  return Response.json({
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description ?? null,
      configJson: b.configJson ?? null,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}
