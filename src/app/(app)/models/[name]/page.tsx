import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { architectureFromPath } from "~/app/api/_lib/contracts";
import { db } from "../../../../../data/db";
import {
  deployment,
  model,
  modelTrainingRun,
  trainingRun,
} from "../../../../../data/schema";
import ModelSandbox from "../ModelSandbox";

type ModelApiInfoProps = {
  modelId: string;
  global?: boolean;
};

function ModelApiInfo({ modelId, global = false }: ModelApiInfoProps) {
  const example = `curl "https://trainpiro.app/api/models/${modelId}/invoke" \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "parts": [
      { "type": "text", "text": "What should you remember?" }
    ]
  }'`;

  return (
    <details className="group rounded-2xl border border-amber-900/30 bg-[#13100c]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-amber-100 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-600/40 text-xs font-serif text-amber-300">
          i
        </span>
        <span>API example</span>
        <span className="ml-auto text-xs text-amber-500/50 transition group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="border-t border-amber-900/25 p-4">
        {global && (
          <p className="mb-3 text-xs leading-relaxed text-orange-200/70">
            This endpoint targets a shared model. Do not use it for production
            workloads or sensitive data.
          </p>
        )}
        <pre className="overflow-x-auto rounded-xl border border-amber-900/25 bg-[#0b0908] p-4 text-[11px] leading-relaxed text-amber-200/80">
          <code>{example}</code>
        </pre>
        <p className="mt-3 text-xs leading-relaxed text-amber-600/55">
          Keep <code className="text-amber-200/75">PIRO_API_KEY</code> on your
          server. Create one from Profile → API Keys.
        </p>
      </div>
    </details>
  );
}

export default async function ModelSandboxPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [modelRow] = await db
    .select({
      id: deployment.id,
      sourceModelId: model.id,
      sourceName: model.name,
      description: model.description,
      parameterCount: model.parameterCount,
      inferenceEndpoint: model.inferenceEndpoint,
      weightsR2Key: model.weightsR2Key,
      createdAt: model.createdAt,
      isGlobal: deployment.isAdmin,
    })
    .from(deployment)
    .innerJoin(model, eq(deployment.modelId, model.id))
    .where(
      and(
        isNull(model.archivedAt),
        eq(deployment.enabled, true),
        or(
          and(
            eq(deployment.id, name),
            eq(deployment.isAdmin, false),
            eq(deployment.createdByUserId, session.user.id),
          ),
          and(
            eq(model.name, name),
            eq(deployment.isAdmin, true),
            or(
              isNull(deployment.targetUserId),
              eq(deployment.targetUserId, session.user.id),
            ),
          ),
        ),
      ),
    )
    .orderBy(desc(deployment.isAdmin), desc(deployment.createdAt))
    .limit(1);

  if (!modelRow) notFound();

  const [trainingLink] = await db
    .select({ trainingRunId: modelTrainingRun.trainingRunId })
    .from(modelTrainingRun)
    .where(eq(modelTrainingRun.modelId, modelRow.sourceModelId))
    .limit(1);
  const [run] = trainingLink
    ? await db
        .select({ architecturePath: trainingRun.architecturePath })
        .from(trainingRun)
        .where(eq(trainingRun.id, trainingLink.trainingRunId))
        .limit(1)
    : [];

  const isGlobal = modelRow.isGlobal;
  const displayName = isGlobal ? modelRow.sourceName : modelRow.id;
  const architecture = run?.architecturePath
    ? architectureFromPath(run.architecturePath)
    : null;
  const ready = Boolean(
    modelRow.inferenceEndpoint && modelRow.weightsR2Key && architecture,
  );

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/models"
          className="text-sm font-semibold text-amber-400/65 transition hover:text-amber-200"
        >
          ← Back to models
        </Link>

        <header className="mt-8 flex flex-col gap-5 border-b border-amber-900/25 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
                {displayName}
              </h1>
              {isGlobal && (
                <span className="rounded-full border border-orange-500/35 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-300">
                  Shared model
                </span>
              )}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-amber-200/55">
              {modelRow.description ||
                (isGlobal
                  ? "A shared Piro model available to the community."
                  : "Your private stateful deployment.")}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              ready
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                : "border-amber-700/30 bg-amber-900/15 text-amber-400/65"
            }`}
          >
            {ready ? "Stateful inference ready" : "Deployment preparing"}
          </span>
        </header>

        {isGlobal && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-orange-500/35 bg-orange-500/10 px-5 py-4 text-sm leading-relaxed text-orange-100/80"
          >
            <strong className="font-bold text-orange-200">Shared model:</strong>{" "}
            this model is available to everyone and is not a production or
            privacy boundary. Do not send sensitive data. Deploy a private model
            before using Piro with real production data.
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <ModelSandbox
            modelId={isGlobal ? modelRow.sourceModelId : modelRow.id}
            modelName={displayName}
            ready={ready}
          />
          <aside className="space-y-5">
            <ModelApiInfo
              modelId={isGlobal ? modelRow.sourceModelId : modelRow.id}
              global={isGlobal}
            />
            <section className="rounded-2xl border border-amber-900/30 bg-[#13100c] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500/60">
                Model details
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-amber-400/50">Parameters</dt>
                  <dd className="text-right text-amber-100/80">
                    {modelRow.parameterCount?.toLocaleString() ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-amber-400/50">Created</dt>
                  <dd className="text-right text-amber-100/80">
                    {modelRow.createdAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-amber-400/50">Access</dt>
                  <dd className="text-right text-amber-100/80">
                    {isGlobal ? "Shared" : "Private"}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
