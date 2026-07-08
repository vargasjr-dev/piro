import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../data/db";
import {
  model,
  modelTrainingRun,
  modelHostedApi,
  trainingRun,
  benchmarkRun,
} from "../../../../../data/schema";
import WeightGraph from "./WeightGraph";
import ArchiveModelButton from "./ArchiveModelButton";
import ModelPlayground from "./ModelPlayground";
import { r2Get } from "~/lib/r2";
import ScorePill from "~/components/ScorePill";

function fmt(date: Date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtRelative(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return fmt(date);
}

function fmtDuration(ms: number | null) {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [m] = await db
    .select()
    .from(model)
    .where(and(eq(model.id, id), eq(model.userId, session.user.id)))
    .limit(1);

  if (!m) notFound();

  // Training run (include weightsJson for visualization)
  const [trainingLink] = await db
    .select()
    .from(modelTrainingRun)
    .where(eq(modelTrainingRun.modelId, id))
    .limit(1);

  let run: typeof trainingRun.$inferSelect | null = null;
  if (trainingLink) {
    const [r] = await db
      .select()
      .from(trainingRun)
      .where(eq(trainingRun.id, trainingLink.trainingRunId))
      .limit(1);
    run = r ?? null;
  }

  // Hosted API
  const [hostedApi] = await db
    .select()
    .from(modelHostedApi)
    .where(eq(modelHostedApi.modelId, id))
    .limit(1);

  // Benchmark history — all runs where this model was a target, newest first
  const benchmarkHistory = await db
    .select({
      id: benchmarkRun.id,
      suiteRunId: benchmarkRun.suiteRunId,
      benchmarkName: benchmarkRun.benchmarkName,
      score: benchmarkRun.score,
      costUsd: benchmarkRun.costUsd,
      durationMs: benchmarkRun.durationMs,
      ranAt: benchmarkRun.ranAt,
    })
    .from(benchmarkRun)
    .where(and(eq(benchmarkRun.target, m.name), eq(benchmarkRun.userId, session.user.id)))
    .orderBy(desc(benchmarkRun.ranAt))
    .limit(50);

  const isTrainedModel = !!run;
  const archPath = run?.architecturePath ?? null;

  // Fetch weights JSON from R2 for visualization (null if not yet trained / uploaded)
  const weightsJson = m.weightsR2Key
    ? await r2Get(`${m.weightsR2Key}/weights.json`).catch(() => null)
    : null;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link href="/models" className="text-amber-600/40 hover:text-amber-400/70 transition-colors shrink-0">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-amber-100 font-bold text-sm tracking-tight truncate">{m.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {isTrainedModel ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/25 text-orange-400/70 font-medium">
                Trained
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/20 border border-amber-800/20 text-amber-500/50 font-medium">
                Hosted API
              </span>
            )}
            {m.archivedAt && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/20 border border-amber-800/20 text-amber-600/50 font-medium">
                Archived
              </span>
            )}
            {m.parameterCount && (
              <span className="text-[10px] text-amber-700/30 font-mono">{m.parameterCount.toLocaleString()} params</span>
            )}
          </div>
        </div>
        <ArchiveModelButton modelId={m.id} />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-lg">

        {/* Info */}
        <div className="space-y-2">
          <h2 className="text-[10px] font-semibold text-amber-400/40 uppercase tracking-widest">Info</h2>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-amber-600/40">Created</span>
              <span className="text-amber-200/60">{fmt(m.createdAt)}</span>
            </div>
            {archPath && (
              <div className="flex justify-between text-xs">
                <span className="text-amber-600/40">Architecture</span>
                <span className="text-amber-200/60">{archPath}</span>
              </div>
            )}
            {run && (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-600/40">Epochs trained</span>
                  <span className="text-amber-200/60 font-mono">{run.epochs}</span>
                </div>
                {run.finalValAccuracy !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600/40">Final val acc</span>
                    <span className="text-amber-200/60 font-mono">{(run.finalValAccuracy * 100).toFixed(1)}%</span>
                  </div>
                )}
                {run.finalValLoss !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600/40">Final val loss</span>
                    <span className="text-amber-200/60 font-mono">{run.finalValLoss.toFixed(4)}</span>
                  </div>
                )}
                {m.inferenceEndpoint ? (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600/40">Inference</span>
                    <span className="text-emerald-400/60 font-mono text-[10px]">ready</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600/40">Inference</span>
                    <span className="text-amber-700/35 text-[10px]">retrain to enable</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-amber-600/40">Training run</span>
                  <Link
                    href={`/training/${run.id}`}
                    className="text-orange-400/60 hover:text-orange-300/80 font-mono transition-colors"
                  >
                    {run.id.slice(0, 8)}… →
                  </Link>
                </div>
              </>
            )}
            {hostedApi && (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-600/40">Provider</span>
                  <span className="text-amber-200/60 capitalize">{hostedApi.provider}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-600/40">Model ID</span>
                  <span className="text-amber-200/60 font-mono">{hostedApi.apiModelName}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Weights visualization */}
        {isTrainedModel && (
          <div className="space-y-3">
            <h2 className="text-[10px] font-semibold text-amber-400/40 uppercase tracking-widest">Weights</h2>
            <WeightGraph weightsJson={weightsJson} />
          </div>
        )}

        {/* Playground — interactive inference */}
        {isTrainedModel && (
          <div className="space-y-3">
            <h2 className="text-[10px] font-semibold text-amber-400/40 uppercase tracking-widest">Playground</h2>
            <ModelPlayground
              modelId={m.id}
              inferenceReady={!!m.inferenceEndpoint}
            />
          </div>
        )}

        {!isTrainedModel && hostedApi && (
          <div className="px-4 py-6 rounded-xl border border-amber-900/20 bg-amber-900/5 text-center">
            <p className="text-xs text-amber-600/40">Hosted API — weights not stored locally</p>
            <p className="text-[10px] text-amber-700/30 mt-1">{hostedApi.provider} / {hostedApi.apiModelName}</p>
          </div>
        )}

        {/* Benchmark history */}
        <div className="space-y-2">
          <h2 className="text-[10px] font-semibold text-amber-400/40 uppercase tracking-widest">
            Benchmark History
            {benchmarkHistory.length > 0 && (
              <span className="ml-1.5 normal-case font-normal text-amber-700/30">
                ({benchmarkHistory.length})
              </span>
            )}
          </h2>

          {benchmarkHistory.length === 0 ? (
            <div className="px-4 py-6 rounded-xl border border-amber-900/20 bg-amber-900/5 text-center">
              <p className="text-xs text-amber-600/40">No benchmark runs yet</p>
              <Link href="/benchmarks" className="text-[10px] text-orange-400/50 hover:text-orange-300/70 transition-colors mt-1 block">
                Run benchmarks →
              </Link>
            </div>
          ) : (
            <div className="border border-amber-900/20 rounded-xl overflow-hidden divide-y divide-amber-900/10">
              {benchmarkHistory.map((row) => (
                <Link
                  key={row.id}
                  href={`/benchmarks/runs/${row.suiteRunId}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-900/8 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-200/65 truncate">{row.benchmarkName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-amber-700/35">{fmtRelative(row.ranAt)}</span>
                      {row.durationMs !== null && (
                        <span className="text-[10px] text-amber-800/30">{fmtDuration(row.durationMs)}</span>
                      )}
                    </div>
                  </div>
                  <ScorePill score={row.score} />
                  <svg className="w-3 h-3 text-amber-800/25 group-hover:text-amber-600/40 transition-colors shrink-0"
                    fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
