import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "~/lib/auth.server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../../../../data/db";
import { deployment, model } from "../../../../data/schema";
import { getSubscription, isActive } from "~/lib/billing";
import DeployModelButton from "~/components/DeployModelButton";

type ModelRow = {
  id: string;
  name: string;
  description: string | null;
  parameterCount: number | null;
  inferenceEndpoint: string | null;
  weightsR2Key: string | null;
  createdAt: string;
};

function ModelIcon({ global = false }: { global?: boolean }) {
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
        global
          ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
          : "border-amber-800/30 bg-amber-900/10 text-amber-300"
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3 4.5 7.25v9.5L12 21l7.5-4.25v-9.5L12 3Z" />
        <path d="m4.5 7.25 7.5 4.5 7.5-4.5M12 11.75V21" />
      </svg>
    </div>
  );
}

function ModelCard({
  model: item,
  global = false,
}: {
  model: ModelRow;
  global?: boolean;
}) {
  const ready = Boolean(item.inferenceEndpoint && item.weightsR2Key);

  return (
    <article className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5 transition-colors hover:border-amber-700/40">
      <div className="flex items-start gap-3">
        <ModelIcon global={global} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-amber-50">
              {item.name}
            </h3>
            {global && (
              <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-300">
                Global
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-amber-300/50">
            {item.description ||
              (global
                ? "The current shared Piro model."
                : "Your private stateful Piro deployment.")}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-amber-900/20 pt-4 text-[11px] text-amber-500/50">
        <span className={ready ? "text-emerald-300/70" : "text-amber-400/50"}>
          {ready ? "Stateful inference ready" : "Deployment preparing"}
        </span>
        {item.parameterCount !== null && (
          <span>{item.parameterCount.toLocaleString()} parameters</span>
        )}
        <span>
          {new Date(item.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>
    </article>
  );
}

function EmptyState({
  global = false,
  canDeploy = false,
}: {
  global?: boolean;
  canDeploy?: boolean;
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
      {!global && canDeploy && <DeployModelButton />}
      {!global && !canDeploy && (
        <Link
          href="/upgrade"
          className="mt-6 inline-flex rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 transition hover:border-orange-400/70 hover:bg-orange-500/20 hover:text-orange-200"
        >
          Upgrade To Deploy
        </Link>
      )}
    </div>
  );
}

export default async function ModelsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const subscription = await getSubscription(session.user.id);
  const canDeploy = isActive(subscription);
  const selectFields = {
    id: model.id,
    name: model.name,
    description: model.description,
    parameterCount: model.parameterCount,
    inferenceEndpoint: model.inferenceEndpoint,
    weightsR2Key: model.weightsR2Key,
    createdAt: deployment.createdAt,
  };

  const [privateModels, globalModels] = await Promise.all([
    db
      .select(selectFields)
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
    db
      .select(selectFields)
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
  ]);

  const toRows = (rows: typeof privateModels): ModelRow[] =>
    rows.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    }));

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
            <EmptyState canDeploy={canDeploy} />
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
              <p className="mt-1 text-xs text-amber-500/50">
                The current shared models available to everyone.
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
                <ModelCard key={item.id} model={item} global />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
