import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { db } from "../../../../../data/db";
import { benchmarkSuiteRun } from "../../../../../data/schema";
import { runSuite } from "~/lib/benchmarks/runner";

// Allow up to 5 min for the background benchmark suite to finish
export const maxDuration = 300;

// ── POST /api/benchmarks/trigger ─────────────────────────────────────────────
// Body: { benchmarks?: string[], targets?: string[] }
// Creates a suite run record, kicks off benchmarks via waitUntil, returns 202.

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { benchmarks, targets } = body as {
    benchmarks?: string[];
    targets?: string[];
  };

  const benchmarkFilter = benchmarks?.length ? benchmarks : null;
  const targetFilter = targets?.length ? targets : null;

  // Create the suite run record — this is what the UI polls
  const suiteRunId = crypto.randomUUID();
  await db.insert(benchmarkSuiteRun).values({
    id: suiteRunId,
    userId: session.user.id,
    status: "queued",
    benchmarks: benchmarkFilter ? JSON.stringify(benchmarkFilter) : null,
    targets: targetFilter ? JSON.stringify(targetFilter) : null,
  });

  // Run benchmarks in the background — response returns immediately
  waitUntil(runSuite(suiteRunId, session.user.id, benchmarkFilter, targetFilter));

  return NextResponse.json({ suiteRunId }, { status: 202 });
}
