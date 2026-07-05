import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { dataSource } from "../../../../data/schema";


interface SourceRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  r2Prefix: string | null;
  sampleCount: number | null;
  generatedAt: string | null;
  createdAt: string;
}

function SourceCard({ source }: { source: SourceRow }) {
  const hasData = source.r2Prefix !== null && source.generatedAt !== null;
  return (
    <Link
      href={`/sources/${source.id}`}
      className="block px-4 py-3.5 rounded-xl border border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-amber-100">{source.name}</h3>
            {!hasData && (
              <span className="text-[10px] text-amber-700/30 italic">not generated</span>
            )}
          </div>
          {source.description && (
            <p className="text-[11px] text-amber-600/40 leading-relaxed truncate max-w-xs">{source.description}</p>
          )}
          <div className="flex items-center gap-3 text-[11px]">
            {source.sampleCount !== null && (
              <span className="text-amber-600/40">
                <span className="font-mono text-amber-500/50">{source.sampleCount.toLocaleString()}</span> samples
              </span>
            )}
            {source.generatedAt && (
              <span className="text-amber-700/30">
                generated {new Date(source.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>
        <svg className="w-4 h-4 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

export default async function SourcesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const sources = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.userId, session.user.id))
    .orderBy(desc(dataSource.createdAt));

  const rows: SourceRow[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    r2Prefix: s.r2Prefix,
    sampleCount: s.sampleCount,
    generatedAt: s.generatedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Data Sources</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">Synthetic and uploaded training data</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[280px] text-center">
            <p className="text-sm font-semibold text-amber-200/60">No data sources yet</p>
            <p className="text-xs text-amber-600/40 mt-1 max-w-xs">
              Sources are seeded automatically. Upload files to the bucket to create new ones.
            </p>
          </div>
        ) : (
          rows.map((s) => <SourceCard key={s.id} source={s} />)
        )}
      </div>
    </div>
  );
}
