import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { benchmarkRun } from "../../../../data/schema";
import BenchmarkDashboard from "./BenchmarkDashboard";

export default async function BenchmarksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const rows = await db
    .select()
    .from(benchmarkRun)
    .where(eq(benchmarkRun.userId, session.user.id))
    .orderBy(desc(benchmarkRun.ranAt));

  // Latest result per (benchmarkName, target)
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

  return (
    <div className="flex flex-col h-full min-h-screen">
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">
            Benchmarks
          </h1>
          <p className="text-xs text-amber-400/40 mt-0.5">
            Track model capability across runs
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <BenchmarkDashboard
          benchmarkNames={benchmarkNames}
          latestRuns={latest}
        />
      </div>
    </div>
  );
}
