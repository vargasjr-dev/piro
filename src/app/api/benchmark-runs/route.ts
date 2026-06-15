import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { benchmarkRun, benchmarkSuiteRun } from "../../../../data/schema";
import { z } from "zod/v4";

// ── Ingest schema ─────────────────────────────────────────────────────────────

const RunResultSchema = z.object({
  benchmarkName: z.string().min(1),
  target: z.string().min(1),
  score: z.number().min(0).max(1),
  costUsd: z.number().min(0).optional(),
  durationMs: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PostBodySchema = z.object({
  suiteRunId: z.string().min(1),
  ranAt: z.string().optional(), // ISO timestamp; defaults to now
  results: z.array(RunResultSchema).min(1),
});

// ── GET /api/benchmark-runs — latest result per (benchmarkName, target) ──────

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Most recent result per benchmark × target combination
  const rows = await db
    .select()
    .from(benchmarkRun)
    .where(eq(benchmarkRun.userId, session.user.id))
    .orderBy(desc(benchmarkRun.ranAt));

  // Build unique latest per (benchmarkName, target)
  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const row of rows) {
    const key = `${row.benchmarkName}:${row.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      latest.push(row);
    }
  }

  const benchmarkNames = [...new Set(rows.map((r) => r.benchmarkName))];

  return NextResponse.json({ latest, benchmarkNames });
}

// ── POST /api/benchmark-runs — ingest results ─────────────────────────────────
// Accepts either:
//   a) A valid better-auth session cookie (browser / --post-token)
//   b) Authorization: Bearer <BENCHMARK_API_KEY> (CI / --post-key)

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const apiKey = process.env.BENCHMARK_API_KEY;
  const authHeader = req.headers.get("authorization");
  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    const userId = apiKey.split(":")[0];
    if (userId) return userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const { suiteRunId, ranAt, results } = parsed.data;
  const ranAtDate = ranAt ? new Date(ranAt) : new Date();

  const rows = results.map((r) => ({
    id: crypto.randomUUID(),
    userId,
    suiteRunId,
    benchmarkName: r.benchmarkName,
    target: r.target,
    score: r.score,
    costUsd: r.costUsd ?? null,
    durationMs: r.durationMs ?? null,
    metadata: r.metadata ? JSON.stringify(r.metadata) : null,
    ranAt: ranAtDate,
  }));

  await db.insert(benchmarkRun).values(rows);

  await db
    .update(benchmarkSuiteRun)
    .set({ status: "complete", completedAt: new Date() })
    .where(eq(benchmarkSuiteRun.id, suiteRunId));

  return NextResponse.json({ inserted: rows.length }, { status: 201 });
}
