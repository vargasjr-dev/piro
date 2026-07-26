import Link from "next/link";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../../../../data/db";
import { deployment, model } from "../../../../data/schema";
import {
  getRequestSession,
  getRequestSubscription,
} from "~/lib/request-context";
import { isActive } from "~/lib/billing";
import DeployModelButton, {
  type PretrainedModelOption,
} from "~/components/DeployModelButton";

type ModelRow = {
  id: string;
  name: string;
  parameterCount: number | null;
  createdAt: string;
};

async function timedModelsPhase<T>(
  phase: string,
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await operation();
    console.info(
      "[models-load]",
      JSON.stringify({
        phase,
        status: "ok",
        durationMs: Math.round(performance.now() - started),
      }),
    );
    return result;
  } catch (error) {
    console.error(
      "[models-load]",
      JSON.stringify({
        phase,
        status: "error",
        durationMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    throw error;
  }
}

function ModelCard({ model: item }: { model: ModelRow }) {
  return (
    <article className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5 transition-colors hover:border-amber-700/40">
      <Link
        href={`/models/${encodeURIComponent(item.name)}`}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-amber-50">
              {item.name}
            </h3>
            {item.parameterCount !== null && (
              <p className="mt-1 text-xs text-amber-300/50">
                {item.parameterCount.toLocaleString()} parameters
              </p>
            )}
          </div>
          <span className="shrink-0 text-right text-[11px] text-amber-500/50">
            {new Date(item.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </Link>
    </article>
  );
}

function EmptyState({
  global = false,
  isSubscribed = false,
  pretrainedModels = [],
}: {
  global?: boolean;
  isSubscribed?: boolean;
  pretrainedModels?: PretrainedModelOption[];
}) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-amber-200/60">
        {global ? "No global models published yet" : "No private models yet"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-amber-600/45">
        {global
          ? "The Piro team will publish the first shared model here."
          : "Your dedicated stateful deployments will appear here once they are ready."}
      </p>
      {!global && isSubscribed ? (
        <DeployModelButton pretrainedModels={pretrainedModels} />
      ) : !global ? (
        <Link
          href="/upgrade"
          className="mt-6 inline-flex rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 transition hover:border-orange-400/70 hover:bg-orange-500/20 hover:text-orange-200"
        >
          Upgrade To Deploy
        </Link>
      ) : null}
    </div>
  );
}

export default async function ModelsPage() {
  const pageStarted = performance.now();
  const session = await timedModelsPhase("auth", getRequestSession);
  if (!session) return null;

  const privateSelectFields = {
    id: model.id,
    name: model.name,
    parameterCount: model.parameterCount,
    createdAt: deployment.createdAt,
  };
  const globalSelectFields = {
    ...privateSelectFields,
    targetUserId: deployment.targetUserId,
    weightsR2Key: model.weightsR2Key,
    inferenceEndpoint: model.inferenceEndpoint,
  };

  const [privateModels, globalModels] = await Promise.all([
    timedModelsPhase("private-deployments-query", () =>
      db
        .select(privateSelectFields)
        .from(deployment)
        .innerJoin(model, eq(deployment.modelId, model.id))
        .where(
          and(
            eq(deployment.createdByUserId, session.user.id),
            eq(deployment.isAdmin, false),
            eq(deployment.enabled, true),
            isNull(model.archivedAt),
          ),
        )
        .orderBy(desc(deployment.createdAt)),
    ),
    timedModelsPhase("global-deployments-query", () =>
      db
        .select(globalSelectFields)
        .from(deployment)
        .innerJoin(model, eq(deployment.modelId, model.id))
        .where(
          and(
            eq(deployment.isAdmin, true),
            eq(deployment.enabled, true),
            or(
              isNull(deployment.targetUserId),
              eq(deployment.targetUserId, session.user.id),
            ),
            isNull(model.archivedAt),
          ),
        )
        .orderBy(desc(deployment.createdAt)),
    ),
  ]);

  const subscription =
    privateModels.length === 0
      ? await timedModelsPhase("subscription", getRequestSubscription)
      : null;
  const totalMs = Math.round(performance.now() - pageStarted);
  console.info(
    "[models-load]",
    JSON.stringify({
      phase: "complete",
      status: "ok",
      durationMs: totalMs,
      privateCount: privateModels.length,
      globalCount: globalModels.length,
    }),
  );

  const isSubscribed = isActive(subscription);
  const toRows = (rows: typeof privateModels): ModelRow[] =>
    rows.map((item) => ({
      id: item.id,
      name: item.name,
      parameterCount: item.parameterCount,
      createdAt: item.createdAt.toISOString(),
    }));
  const pretrainedModelOptions: PretrainedModelOption[] = globalModels
    .filter(
      (item) =>
        item.targetUserId === null &&
        item.weightsR2Key &&
        item.inferenceEndpoint,
    )
    .slice(0, 3)
    .map(({ id, name }) => ({ id, name }));

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
            Stateful intelligence
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
            Your models
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-amber-200/55">
            Choose the model you want to work with. Private deployments keep
            their own state; global deployments are the shared Piro frontier.
          </p>
        </div>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-amber-50">
                Private deployments
              </h2>
              <p className="mt-1 text-xs text-amber-500/50">
                Models owned by your account.
              </p>
            </div>
            <span className="text-xs text-amber-600/40">
              {privateModels.length}{" "}
              {privateModels.length === 1 ? "model" : "models"}
            </span>
          </div>
          {privateModels.length === 0 ? (
            <EmptyState
              isSubscribed={isSubscribed}
              pretrainedModels={pretrainedModelOptions}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {toRows(privateModels).map((item) => (
                <ModelCard key={item.id} model={item} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 border-t border-amber-900/20 pt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-amber-50">
                Global Piro models
              </h2>
              <p className="mt-1 text-xs text-amber-300/50">
                Shared models for exploration only — do not use them for
                production or sensitive data.
              </p>
            </div>
            <span className="text-xs text-amber-600/40">
              {globalModels.length}{" "}
              {globalModels.length === 1 ? "model" : "models"}
            </span>
          </div>
          {globalModels.length === 0 ? (
            <EmptyState global />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {toRows(globalModels).map((item) => (
                <ModelCard key={item.id} model={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
