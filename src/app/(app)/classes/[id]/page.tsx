import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { modelClass } from "../../../../../data/schema";
import { r2Get } from "~/lib/r2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassManifest {
  name: string;
  slug: string;
  description?: string;
  hyperparams?: Record<string, number | string | boolean>;
  parameterCount?: number;
  module?: string;
  modelClass?: string;
  configClass?: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [cls] = await db
    .select()
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, session.user.id)))
    .limit(1);

  if (!cls) notFound();

  // Fetch manifest + source from R2 when available
  let manifest: ClassManifest | null = null;
  let source: string | null = null;

  if (cls.moduleR2Key) {
    const [manifestRaw, sourceRaw] = await Promise.all([
      r2Get(`${cls.moduleR2Key}/manifest.json`),
      r2Get(`${cls.moduleR2Key}/model.py`),
    ]);
    if (manifestRaw) {
      try { manifest = JSON.parse(manifestRaw) as ClassManifest; } catch { /* ignore */ }
    }
    source = sourceRaw;
  }

  // Fall back to DB fields if no manifest yet
  const name = manifest?.name ?? cls.name;
  const slug = manifest?.slug ?? cls.slug;
  const description = manifest?.description ?? cls.description ?? null;
  const paramCount = manifest?.parameterCount ?? cls.parameterCount ?? null;
  const hyperparams = manifest?.hyperparams ?? null;

  const needsSeed = !cls.moduleR2Key;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/classes"
            className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-amber-100 font-bold text-sm tracking-tight">{name}</h1>
            <p className="text-[11px] text-amber-400/40 mt-0.5 font-mono">{slug}</p>
          </div>
        </div>

        <Link
          href={`/training/new?class=${encodeURIComponent(slug)}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
          </svg>
          Train
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-2xl space-y-6">

          {/* Seed warning */}
          {needsSeed && (
            <div className="px-4 py-3 rounded-xl border border-amber-700/20 bg-amber-900/10 text-xs text-amber-500/60 leading-relaxed">
              <span className="font-semibold text-amber-400/70">Module not uploaded.</span>{" "}
              Hit{" "}
              <a
                href="/api/admin/seed-class-modules"
                target="_blank"
                className="text-orange-400/60 hover:text-orange-300/80 transition-colors"
              >
                /api/admin/seed-class-modules
              </a>{" "}
              to upload the Python module to R2.
            </div>
          )}

          {/* Description */}
          {description && (
            <p className="text-sm text-amber-400/60 leading-relaxed">{description}</p>
          )}

          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-3">
            {manifest?.modelClass && (
              <div className="px-4 py-3 rounded-xl border border-amber-900/20 bg-amber-900/5">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-700/40 mb-1">Class</p>
                <p className="text-xs font-mono text-amber-300/70">{manifest.modelClass}</p>
              </div>
            )}
            {manifest?.configClass && (
              <div className="px-4 py-3 rounded-xl border border-amber-900/20 bg-amber-900/5">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-700/40 mb-1">Config</p>
                <p className="text-xs font-mono text-amber-300/70">{manifest.configClass}</p>
              </div>
            )}
            {manifest?.module && (
              <div className="px-4 py-3 rounded-xl border border-amber-900/20 bg-amber-900/5">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-700/40 mb-1">Module</p>
                <p className="text-xs font-mono text-amber-300/70">{manifest.module}</p>
              </div>
            )}
            {paramCount != null && (
              <div className="px-4 py-3 rounded-xl border border-amber-900/20 bg-amber-900/5">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-700/40 mb-1">Parameters</p>
                <p className="text-xs font-mono text-amber-300/70">{paramCount.toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* Hyperparams */}
          {hyperparams && Object.keys(hyperparams).length > 0 && (
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50 mb-3">
                Default hyperparameters
              </h2>
              <div className="rounded-xl border border-amber-900/20 overflow-hidden divide-y divide-amber-900/10">
                {Object.entries(hyperparams).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-mono text-amber-600/50">{key}</span>
                    <span className="text-xs font-mono font-semibold text-amber-300/70">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Python source */}
          {source && (
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50 mb-3">
                Source
              </h2>
              <div className="rounded-xl border border-amber-900/20 bg-[#0d0a08] overflow-hidden">
                <pre className="p-4 text-[11px] font-mono text-amber-300/60 leading-relaxed overflow-x-auto whitespace-pre">
                  {source}
                </pre>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
