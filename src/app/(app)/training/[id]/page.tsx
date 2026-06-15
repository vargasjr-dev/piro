import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { trainingRun } from "../../../../../data/schema";
import RunDetail from "./RunDetail";
import type { TrainingRunRow } from "../RunsList";

export default async function TrainingRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [run] = await db
    .select()
    .from(trainingRun)
    .where(and(eq(trainingRun.id, id), eq(trainingRun.userId, session.user.id)))
    .limit(1);

  if (!run) notFound();

  const initialRun: TrainingRunRow = {
    id: run.id,
    modelTemplate: run.modelTemplate,
    dataSource: run.dataSource,
    status: run.status as TrainingRunRow["status"],
    epochs: run.epochs,
    configJson: run.configJson,
    finalTrainLoss: run.finalTrainLoss,
    finalValLoss: run.finalValLoss,
    finalValAccuracy: run.finalValAccuracy,
    error: run.error,
    queuedAt: run.queuedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link
          href="/training"
          className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Training Run</h1>
          <p className="text-[11px] text-amber-400/40 mt-0.5 font-mono">{run.id.slice(0, 8)}…</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <RunDetail initialRun={initialRun} />
      </div>
    </div>
  );
}
