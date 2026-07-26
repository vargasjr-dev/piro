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
};

function ModelApiInfo({ modelId }: ModelApiInfoProps) {
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
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-amber-100 marker:hidden [&::-webkit-details-marker]:hidden">
        <span>API example</span>
        <span className="ml-auto text-xs text-amber-500/50 transition group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="border-t border-amber-900/25 p-4">
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
      id: model.id,
      name: model.name,
      parameterCount: model.parameterCount,
      inferenceEndpoint: model.inferenceEndpoint,
      weightsR2Key: model.weightsR2Key,
      createdAt: model.createdAt,
      isGlobal: deployment.isAdmin,
    })
    .from(model)
    .innerJoin(deployment, eq(deployment.modelId, model.id))
    .where(
      and(
        eq(model.name, name),
        isNull(model.archivedAt),
        eq(deployment.enabled, true),
        or(
          and(
            eq(deployment.isAdmin, false),
            eq(deployment.createdByUserId, session.user.id),
            eq(model.userId, session.user.id),
          ),
          and(
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
    .where(eq(modelTrainingRun.modelId, modelRow.id))
    .limit(1);
  const [run] = trainingLink
    ? await db
        .select({ architecturePath: trainingRun.architecturePath })
        .from(trainingRun)
        .where(eq(trainingRun.id, trainingLink.trainingRunId))
        .limit(1)
    : [];

  const architecture = run?.architecturePath
    ? architectureFromPath(run.architecturePath)
    : null;
  const ready = Boolean(
    modelRow.inferenceEndpoint && modelRow.weightsR2Key && architecture,
  );

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/models"
          className="text-sm font-semibold text-amber-400/65 transition hover:text-amber-200"
        >
          ← Models
        </Link>

        <h1 className="mt-5 truncate text-2xl font-black tracking-tight text-amber-50 sm:text-3xl">
          {modelRow.name}
        </h1>

        <div className="mt-4">
          <ModelSandbox
            modelId={modelRow.id}
            modelName={modelRow.name}
            ready={ready}
          />
        </div>

        <details className="group mt-4 rounded-2xl border border-amber-900/30 bg-[#13100c]">
          <summary className="flex cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold text-amber-100 marker:hidden [&::-webkit-details-marker]:hidden">
            <span>More</span>
            <span className="ml-auto text-xs text-amber-500/50 transition group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <div className="space-y-4 border-t border-amber-900/25 p-4">
            {modelRow.isGlobal && (
              <div
                role="alert"
                className="rounded-2xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 text-sm leading-relaxed text-orange-100/80"
              >
                <strong className="font-bold text-orange-200">
                  Shared model:
                </strong>{" "}
                Not for production workloads or sensitive data.
              </div>
            )}

            <ModelApiInfo modelId={modelRow.id} />

            <dl className="space-y-3 rounded-2xl border border-amber-900/30 bg-[#0e0b09] p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-amber-400/50">Status</dt>
                <dd className="text-right text-amber-100/80">
                  {ready ? "Ready" : "Preparing"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-amber-400/50">Parameters</dt>
                <dd className="text-right text-amber-100/80">
                  {modelRow.parameterCount?.toLocaleString() ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-amber-400/50">Deployed</dt>
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
                  {modelRow.isGlobal ? "Shared" : "Private"}
                </dd>
              </div>
            </dl>
          </div>
        </details>
      </div>
    </div>
  );
}
