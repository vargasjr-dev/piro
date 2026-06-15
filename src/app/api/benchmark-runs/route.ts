import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../../../../data/db";
import { benchmarkRun } from "../../../../data/schema";
import { z } from "zod/v4";

// ── Ingest schema — matches what run_benchmarks.py POSTs ─────────────────────

const RunResultSchema = z.object({
  benchmarkName: z.string().min(1),
  target: z.string().min(1),
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  passed: z.boolean(),
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

  // Also return the list of distinct benchmark names (for the sidebar list)
  const benchmarkNames = [...new Set(rows.map((r) => r.benchmarkName))];

  return NextResponse.json({ latest, benchmarkNames });
}

// ── POST /api/benchmark-runs — ingest results from run_benchmarks.py ─────────

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
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
    userId: session.user.id,
    suiteRunId,
    benchmarkName: r.benchmarkName,
    target: r.target,
    score: r.score,
    threshold: r.threshold,
    passed: r.passed,
    durationMs: r.durationMs ?? null,
    metadata: r.metadata ? JSON.stringify(r.metadata) : null,
    ranAt: ranAtDate,
  }));

  await db.insert(benchmarkRun).values(rows);

  return NextResponse.json({ inserted: rows.length }, { status: 201 });
}
