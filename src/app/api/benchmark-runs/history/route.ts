import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmarkRun } from "../../../../../data/schema";

// GET /api/benchmark-runs/history?benchmark=OODGeneralization&limit=50
// Returns full run history for one benchmark across all targets

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const benchmarkName = req.nextUrl.searchParams.get("benchmark");
  if (!benchmarkName)
    return NextResponse.json(
      { error: "benchmark query param required" },
      { status: 400 },
    );

  const limit = Math.min(
    200,
    parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10),
  );

  const rows = await db
    .select()
    .from(benchmarkRun)
    .where(
      and(
        eq(benchmarkRun.userId, session.user.id),
        eq(benchmarkRun.benchmarkName, benchmarkName),
      ),
    )
    .orderBy(desc(benchmarkRun.ranAt))
    .limit(limit);

  return NextResponse.json({ runs: rows });
}
