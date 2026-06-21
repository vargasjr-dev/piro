import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { modelClass } from "../../../../data/schema";
import { eq, asc } from "drizzle-orm";
import { buildDefaultClasses } from "~/lib/model-classes";
import Link from "next/link";

export default async function ClassesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const userId = session.user.id;

  let classes = await db
    .select()
    .from(modelClass)
    .where(eq(modelClass.userId, userId))
    .orderBy(asc(modelClass.createdAt));

  // Lazy seed: insert built-in classes on first visit
  if (classes.length === 0) {
    const defaults = buildDefaultClasses(userId);
    await db.insert(modelClass).values(defaults);
    classes = await db
      .select()
      .from(modelClass)
      .where(eq(modelClass.userId, userId))
      .orderBy(asc(modelClass.createdAt));
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Classes</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">
            Model architecture templates available for training
          </p>
        </div>
        <Link
          href="/classes/new"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New class
        </Link>
      </div>

      {/* ── Class cards ──────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 space-y-4 max-w-2xl">
        {classes.map((cls) => {
          const config = cls.configJson
            ? (JSON.parse(cls.configJson) as Record<string, unknown>)
            : null;

          return (
            <Link
              key={cls.id}
              href={`/classes/${cls.id}`}
              className="block border border-amber-900/20 rounded-2xl bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
            >
              {/* ── Card header: name + slug badge + param count ─────────────── */}
              <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-2">
                    <h2 className="text-sm font-semibold text-amber-100">{cls.name}</h2>
                    <span className="text-[9px] font-mono font-medium tracking-wide text-amber-600/60 border border-amber-800/25 bg-amber-900/20 px-1.5 py-0.5 rounded">
                      {cls.slug}
                    </span>
                  </div>
                  {cls.description && (
                    <p className="text-xs text-amber-500/50 leading-relaxed">
                      {cls.description}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  {cls.parameterCount != null && (
                    <div className="text-right">
                      <p className="text-sm font-mono font-semibold text-amber-400/60">
                        {cls.parameterCount.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-amber-700/35 mt-0.5">params</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Hyperparams spec grid ─────────────────────────────────────── */}
              {config && Object.keys(config).length > 0 && (
                <div className="border-t border-amber-900/10 px-6 py-3 flex items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {Object.entries(config).map(([key, val]) => (
                      <div key={key} className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-mono text-amber-700/40">{key}</span>
                        <span className="text-[11px] font-mono font-semibold text-amber-300/65">
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <svg className="w-4 h-4 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
