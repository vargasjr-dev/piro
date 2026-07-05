import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmark, dataSource, benchmarkRun } from "../../../../../data/schema";
import BenchmarkDetail from "./BenchmarkDetail";

export default async function BenchmarkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [bm] = await db
    .select()
    .from(benchmark)
    .where(and(eq(benchmark.id, id), eq(benchmark.userId, session.user.id)))
    .limit(1);

  if (!bm) notFound();

  // Fetch linked data source name
  let dataSourceName: string | null = null;
  if (bm.dataSourceId) {
    const [ds] = await db
      .select({ name: dataSource.name })
      .from(dataSource)
      .where(eq(dataSource.id, bm.dataSourceId))
      .limit(1);
    dataSourceName = ds?.name ?? null;
  }

  // Fetch recent runs for this benchmark
  const runs = await db
    .select()
    .from(benchmarkRun)
    .where(and(eq(benchmarkRun.userId, session.user.id), eq(benchmarkRun.benchmarkName, id)))
    .orderBy(desc(benchmarkRun.ranAt))
    .limit(50);

  // Parse configJson
  let config: Record<string, unknown> | null = null;
  if (bm.configJson) {
    try { config = JSON.parse(bm.configJson); } catch { /* leave null */ }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link
          href="/benchmarks"
          className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">{bm.name}</h1>
          {bm.description && (
            <p className="text-[11px] text-amber-400/40 mt-0.5 max-w-sm">{bm.description}</p>
          )}
        </div>
      </div>

      <BenchmarkDetail
        benchmark={{
          id: bm.id,
          name: bm.name,
          description: bm.description,
          dataSourceId: bm.dataSourceId,
          dataSourceName,
          hasScript: bm.scriptR2Key !== null,
          config,
          createdAt: bm.createdAt.toISOString(),
          updatedAt: bm.updatedAt.toISOString(),
        }}
        runs={runs.map((r) => ({
          id: r.id,
          target: r.target,
          score: r.score,
          costUsd: r.costUsd,
          durationMs: r.durationMs,
          ranAt: r.ranAt.toISOString(),
        }))}
      />
    </div>
  );
}
