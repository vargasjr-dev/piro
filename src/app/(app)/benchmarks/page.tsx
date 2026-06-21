import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, asc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { benchmark } from "../../../../data/schema";
import { buildDefaultBenchmarks } from "~/lib/benchmark-defs";

export default async function BenchmarksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const userId = session.user.id;

  let benchmarks = await db
    .select()
    .from(benchmark)
    .where(eq(benchmark.userId, userId))
    .orderBy(asc(benchmark.createdAt));

  if (benchmarks.length === 0) {
    await db.insert(benchmark).values(buildDefaultBenchmarks(userId));
    benchmarks = await db
      .select()
      .from(benchmark)
      .where(eq(benchmark.userId, userId))
      .orderBy(asc(benchmark.createdAt));
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-amber-900/20 shrink-0">
        <h1 className="text-amber-100 font-bold text-sm tracking-tight">Benchmarks</h1>
        <p className="text-xs text-amber-400/40 mt-0.5">
          Evaluation suites — click one to see its run history
        </p>
      </div>

      {/* Catalog */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {benchmarks.map((bm) => {
            let configParams: Record<string, unknown> = {};
            if (bm.configJson) {
              try {
                configParams = JSON.parse(bm.configJson) as Record<string, unknown>;
              } catch {
                // ignore
              }
            }
            return (
              <Link
                key={bm.id}
                href={`/benchmarks/${bm.slug}`}
                className="block px-4 py-4 rounded-xl border border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Name + slug badge */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-amber-100">{bm.name}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-amber-900/25 bg-amber-900/10 text-amber-600/50">
                        {bm.slug}
                      </span>
                    </div>

                    {/* Description */}
                    {bm.description && (
                      <p className="text-xs text-amber-400/50 leading-relaxed mb-2">
                        {bm.description}
                      </p>
                    )}

                    {/* Config params */}
                    {Object.keys(configParams).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(configParams).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-900/20 bg-amber-900/8 text-amber-700/50"
                          >
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chevron */}
                  <svg
                    className="w-4 h-4 text-amber-800/30 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
