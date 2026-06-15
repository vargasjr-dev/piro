import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { dataSource } from "../../../../data/schema";
import { r2ListPrefix } from "~/lib/r2";

interface SourceRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  r2Prefix: string | null;
  sampleCount: number | null;
  createdAt: string;
  r2Files?: string[];
}

function TypeChip({ type }: { type: string }) {
  if (type === "synthetic") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-violet-900/20 border border-violet-700/20 text-violet-400/70">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
        Synthetic
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-teal-900/20 border border-teal-700/20 text-teal-400/70">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      Uploaded
    </span>
  );
}

function SourceCard({ source }: { source: SourceRow }) {
  return (
    <div className="px-4 py-4 rounded-xl border border-amber-900/20 bg-amber-900/5 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-amber-100">{source.name}</h3>
            <TypeChip type={source.type} />
          </div>
          {source.description && (
            <p className="text-[11px] text-amber-600/40 mt-0.5 leading-relaxed">{source.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px]">
        {source.sampleCount !== null && (
          <span className="text-amber-600/40">
            <span className="text-amber-500/50 font-mono">{source.sampleCount.toLocaleString()}</span>
            {" "}samples
          </span>
        )}
        {source.r2Prefix && (
          <span className="text-amber-600/40 font-mono truncate max-w-[180px]" title={source.r2Prefix}>
            {source.r2Prefix}
          </span>
        )}
      </div>

      {/* R2 file listing for uploaded sources */}
      {source.r2Files && source.r2Files.length > 0 && (
        <div className="pt-2 border-t border-amber-900/15 space-y-1">
          <p className="text-[10px] text-amber-700/30 uppercase tracking-wider">Files in bucket</p>
          <div className="space-y-0.5 max-h-28 overflow-y-auto">
            {source.r2Files.map((f) => (
              <p key={f} className="text-[11px] font-mono text-amber-600/40 truncate">{f}</p>
            ))}
          </div>
        </div>
      )}

      {source.type === "synthetic" && (
        <div className="pt-2 border-t border-amber-900/15">
          <p className="text-[10px] text-amber-700/30 leading-relaxed">
            Generated at runtime by <span className="font-mono">model/data/sequences.py</span> — no files stored in bucket.
          </p>
        </div>
      )}
    </div>
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

  // For uploaded sources, list their R2 files
  const rows: SourceRow[] = await Promise.all(
    sources.map(async (s) => {
      let r2Files: string[] | undefined;
      if (s.type === "uploaded" && s.r2Prefix) {
        try {
          r2Files = await r2ListPrefix(session.user.id, s.r2Prefix);
        } catch {
          r2Files = [];
        }
      }
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        type: s.type,
        r2Prefix: s.r2Prefix,
        sampleCount: s.sampleCount,
        createdAt: s.createdAt.toISOString(),
        r2Files,
      };
    }),
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Sources</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">Training data sources</p>
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
