import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, sql } from "drizzle-orm";
import { db } from "../../../../data/db";
import { model, modelHostedApi, modelTrainingRun, benchmarkRun } from "../../../../data/schema";

interface ModelRow {
  id: string;
  name: string;
  description: string | null;
  parameterCount: number | null;
  createdAt: Date;
  hostedApi: { provider: string; apiModelName: string } | null;
  trainingRunId: string | null;
  benchmarkRunCount: number;
}

function TypeChip({ model: m }: { model: ModelRow }) {
  if (m.hostedApi) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-sky-900/20 border border-sky-700/20 text-sky-400/70">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        Hosted API
      </span>
    );
  }
  if (m.trainingRunId) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-orange-900/20 border border-orange-700/20 text-orange-400/70">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
        </svg>
        Trained
      </span>
    );
  }
  return null;
}

function ModelCard({ m }: { m: ModelRow }) {
  return (
    <div className="px-4 py-4 rounded-xl border border-amber-900/20 bg-amber-900/5 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-amber-100">{m.name}</h3>
            <TypeChip model={m} />
          </div>
          {m.description && (
            <p className="text-[11px] text-amber-600/40 mt-0.5">{m.description}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[11px]">
        {m.parameterCount !== null && (
          <span className="text-amber-600/40">
            <span className="text-amber-500/50 font-mono">{m.parameterCount.toLocaleString()}</span>
            {" "}params
          </span>
        )}
        {m.hostedApi && (
          <span className="text-amber-600/40 font-mono">{m.hostedApi.apiModelName}</span>
        )}
      </div>

      {/* Links row */}
      <div className="flex items-center gap-3 pt-1 border-t border-amber-900/15">
        {m.trainingRunId && (
          <Link
            href={`/training/${m.trainingRunId}`}
            className="flex items-center gap-1 text-[11px] text-amber-500/50 hover:text-amber-300/70 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
            </svg>
            Training run
          </Link>
        )}
        <Link
          href={`/benchmarks?target=${m.id}`}
          className="flex items-center gap-1 text-[11px] text-amber-500/50 hover:text-amber-300/70 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          {m.benchmarkRunCount > 0
            ? `${m.benchmarkRunCount} benchmark run${m.benchmarkRunCount === 1 ? "" : "s"}`
            : "No benchmark runs"}
        </Link>
      </div>
    </div>
  );
}

export default async function ModelsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const models = await db
    .select()
    .from(model)
    .where(eq(model.userId, session.user.id))
    .orderBy(model.createdAt);

  // Hosted API info
  const modelIds = models.map((m) => m.id);
  const hostedApis =
    modelIds.length > 0
      ? await db
          .select()
          .from(modelHostedApi)
          .where(
            eq(
              modelHostedApi.modelId,
              sql`ANY(ARRAY[${sql.join(modelIds.map((id) => sql`${id}`), sql`, `)}])`,
            ),
          )
      : [];

  // Training run links
  const trainingLinks =
    modelIds.length > 0
      ? await db
          .select()
          .from(modelTrainingRun)
          .where(
            eq(
              modelTrainingRun.modelId,
              sql`ANY(ARRAY[${sql.join(modelIds.map((id) => sql`${id}`), sql`, `)}])`,
            ),
          )
      : [];

  // Benchmark run counts
  const counts =
    modelIds.length > 0
      ? await db
          .select({
            target: benchmarkRun.target,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(benchmarkRun)
          .where(eq(benchmarkRun.userId, session.user.id))
          .groupBy(benchmarkRun.target)
      : [];

  const countByTarget = Object.fromEntries(counts.map((c) => [c.target, c.count]));
  const hostedByModelId = Object.fromEntries(hostedApis.map((h) => [h.modelId, h]));
  const trainingByModelId = Object.fromEntries(trainingLinks.map((t) => [t.modelId, t]));

  const rows: ModelRow[] = models.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    parameterCount: m.parameterCount,
    createdAt: m.createdAt,
    hostedApi: hostedByModelId[m.id]
      ? { provider: hostedByModelId[m.id].provider, apiModelName: hostedByModelId[m.id].apiModelName }
      : null,
    trainingRunId: trainingByModelId[m.id]?.trainingRunId ?? null,
    benchmarkRunCount: countByTarget[m.id] ?? 0,
  }));

  const hostedModels = rows.filter((m) => m.hostedApi);
  const trainedModels = rows.filter((m) => m.trainingRunId);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Models</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">All models and their run history</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        {/* Trained models */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest px-1">
            Piro Trained
          </h2>
          {trainedModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-amber-900/25">
              <p className="text-xs text-amber-600/40">No trained models yet.</p>
              <Link
                href="/training/new"
                className="mt-3 text-xs text-orange-400/60 hover:text-orange-300/80 transition-colors"
              >
                Start a training run →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {trainedModels.map((m) => <ModelCard key={m.id} m={m} />)}
            </div>
          )}
        </section>

        {/* Hosted API models */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-amber-400/50 uppercase tracking-widest px-1">
            Hosted APIs
          </h2>
          {hostedModels.length === 0 ? (
            <p className="text-xs text-amber-700/30 px-1">No hosted models configured.</p>
          ) : (
            <div className="space-y-3">
              {hostedModels.map((m) => <ModelCard key={m.id} m={m} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
