import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { trainingRun } from "../../../../data/schema";
import RunsList, { type TrainingRunRow } from "./RunsList";

export default async function TrainingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const runs = await db
    .select()
    .from(trainingRun)
    .where(eq(trainingRun.userId, session.user.id))
    .orderBy(desc(trainingRun.queuedAt))
    .limit(50);

  const initialRuns: TrainingRunRow[] = runs.map((r) => ({
    id: r.id,
    modelTemplate: r.modelTemplate,
    dataSource: r.dataSource,
    status: r.status as TrainingRunRow["status"],
    epochs: r.epochs,
    configJson: r.configJson,
    finalTrainLoss: r.finalTrainLoss,
    finalValLoss: r.finalValLoss,
    finalValAccuracy: r.finalValAccuracy,
    error: r.error,
    queuedAt: r.queuedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Training</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">Train models and track run history</p>
        </div>
        <Link
          href="/training/new"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New run
        </Link>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        <RunsList initialRuns={initialRuns} />
      </div>
    </div>
  );
}
