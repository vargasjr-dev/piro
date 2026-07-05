import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { benchmark, dataSource } from "../../../../data/schema";

interface BenchmarkRow {
  id: string;
  name: string;
  description: string | null;
  dataSourceId: string | null;
  dataSourceName: string | null;
  hasScript: boolean;
  createdAt: string;
}

function BenchmarkCard({ bm }: { bm: BenchmarkRow }) {
  return (
    <Link
      href={`/benchmarks/${bm.id}`}
      className="block px-4 py-3.5 rounded-xl border border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-amber-100">{bm.name}</h3>
            {!bm.hasScript && (
              <span className="text-[10px] text-amber-700/30 italic">no script</span>
            )}
          </div>
          {bm.description && (
            <p className="text-[11px] text-amber-600/40 leading-relaxed truncate max-w-xs">{bm.description}</p>
          )}
          <div className="flex items-center gap-3 text-[11px]">
            {bm.dataSourceName && (
              <span className="text-amber-600/40">
                <span className="font-mono text-amber-500/50">{bm.dataSourceName}</span>
              </span>
            )}
            <span className="text-amber-700/30">
              {new Date(bm.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </div>
        </div>
        <svg className="w-4 h-4 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

export default async function BenchmarksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const benchmarks = await db
    .select({
      id: benchmark.id,
      name: benchmark.name,
      description: benchmark.description,
      dataSourceId: benchmark.dataSourceId,
      dataSourceName: dataSource.name,
      scriptR2Key: benchmark.scriptR2Key,
      createdAt: benchmark.createdAt,
    })
    .from(benchmark)
    .leftJoin(dataSource, eq(benchmark.dataSourceId, dataSource.id))
    .where(eq(benchmark.userId, session.user.id))
    .orderBy(desc(benchmark.createdAt));

  const rows: BenchmarkRow[] = benchmarks.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    dataSourceId: b.dataSourceId,
    dataSourceName: b.dataSourceName,
    hasScript: b.scriptR2Key !== null,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Benchmarks</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">Evaluation protocols for model comparison</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[280px] text-center">
            <p className="text-sm font-semibold text-amber-200/60">No benchmarks yet</p>
            <p className="text-xs text-amber-600/40 mt-1 max-w-xs">
              Create one with <code className="font-mono text-amber-500/50">piro benchmarks create</code>
            </p>
          </div>
        ) : (
          rows.map((b) => <BenchmarkCard key={b.id} bm={b} />)
        )}
      </div>
    </div>
  );
}
