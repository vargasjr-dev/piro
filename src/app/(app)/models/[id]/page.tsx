import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { model, modelTrainingRun, modelHostedApi, trainingRun } from "../../../../../data/schema";
import CTMDiagram from "./CTMDiagram";
import TransformerDiagram from "./TransformerDiagram";

function fmt(date: Date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

  // Training run
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

  const isTrainedModel = !!run;
  const template = run?.modelTemplate ?? null;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link href="/models" className="text-amber-600/40 hover:text-amber-400/70 transition-colors">
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
            {m.parameterCount && (
              <span className="text-[10px] text-amber-700/30 font-mono">{m.parameterCount.toLocaleString()} params</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-lg">

        {/* Meta */}
        <div className="space-y-2">
          <h2 className="text-[10px] font-semibold text-amber-400/40 uppercase tracking-widest">Info</h2>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-amber-600/40">Created</span>
              <span className="text-amber-200/60">{fmt(m.createdAt)}</span>
            </div>
            {template && (
              <div className="flex justify-between text-xs">
                <span className="text-amber-600/40">Architecture</span>
                <span className="text-amber-200/60">
                  {template === "ctm" ? "Continuous Thought Model" : "Baseline Transformer"}
                </span>
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

        {/* Architecture diagram */}
        {isTrainedModel && (
          <div className="space-y-4">
            <h2 className="text-[10px] font-semibold text-amber-400/40 uppercase tracking-widest">Architecture</h2>
            {template === "ctm" && <CTMDiagram configJson={run?.configJson ?? null} />}
            {template === "baseline-transformer" && <TransformerDiagram configJson={run?.configJson ?? null} />}
          </div>
        )}

        {/* Hosted API — no diagram */}
        {!isTrainedModel && hostedApi && (
          <div className="px-4 py-6 rounded-xl border border-amber-900/20 bg-amber-900/5 text-center">
            <p className="text-xs text-amber-600/40">Hosted API — architecture not available locally</p>
            <p className="text-[10px] text-amber-700/30 mt-1">{hostedApi.provider} / {hostedApi.apiModelName}</p>
          </div>
        )}
      </div>
    </div>
  );
}
