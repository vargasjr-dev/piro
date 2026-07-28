import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../data/db";
import {
  deployment,
  model,
  modelHostedApi,
  user,
} from "../../../../../data/schema";
import { setDeploymentEnabled } from "../actions";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminDeploymentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const [deployments, hostedModels] = await Promise.all([
    db
      .select({
        id: deployment.id,
        enabled: deployment.enabled,
        createdAt: deployment.createdAt,
        modelName: model.name,
        modelDescription: model.description,
        inferenceEndpoint: model.inferenceEndpoint,
        weightsR2Key: model.weightsR2Key,
        creatorName: user.name,
        creatorEmail: user.email,
        targetUserId: deployment.targetUserId,
        isAdmin: deployment.isAdmin,
      })
      .from(deployment)
      .innerJoin(model, eq(deployment.modelId, model.id))
      .innerJoin(user, eq(deployment.createdByUserId, user.id))
      .orderBy(desc(deployment.createdAt)),
    db
      .select({
        id: model.id,
        name: model.name,
        description: model.description,
        provider: modelHostedApi.provider,
        apiModelName: modelHostedApi.apiModelName,
        createdAt: model.createdAt,
      })
      .from(model)
      .innerJoin(modelHostedApi, eq(modelHostedApi.modelId, model.id))
      .where(isNull(model.archivedAt))
      .orderBy(desc(model.createdAt)),
  ]);

  const targetUserIds = deployments.flatMap((item) =>
    item.targetUserId ? [item.targetUserId] : [],
  );
  const targetUsers = targetUserIds.length
    ? await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.id, targetUserIds))
    : [];
  const targetUsersById = new Map(
    targetUsers.map((target) => [target.id, target]),
  );

  return (
    <AdminShell current="Deployments">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
          Deployments
        </h1>
        <p className="mt-3 text-sm text-amber-200/55">
          Manage global, private, and third-party hosted model access across
          Piro.
        </p>
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-amber-50">
              Piro deployments
            </h2>
            <p className="mt-1 text-xs text-amber-500/50">
              Stateful models managed by the Piro deployment system.
            </p>
          </div>
          <span className="text-xs text-amber-600/40">
            {deployments.length}{" "}
            {deployments.length === 1 ? "deployment" : "deployments"}
          </span>
        </div>
        {deployments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center text-sm text-amber-200/55">
            No Piro deployments yet.
          </div>
        ) : (
          <div className="space-y-3">
            {deployments.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-amber-50">
                        {item.modelName}
                      </h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.enabled ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-700/30 bg-amber-900/20 text-amber-500/70"}`}
                      >
                        {item.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-amber-300/50">
                      {item.modelDescription || "No deployment description."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-amber-500/50">
                      <span>
                        {item.inferenceEndpoint && item.weightsR2Key
                          ? "Stateful inference ready"
                          : "Deployment preparing"}
                      </span>
                      <span>
                        {item.isAdmin
                          ? item.targetUserId
                            ? `Admin deployment for ${targetUsersById.get(item.targetUserId)?.name ?? targetUsersById.get(item.targetUserId)?.email ?? item.targetUserId}`
                            : "Global deployment"
                          : "Private user deployment"}
                      </span>
                      <span>
                        {item.isAdmin
                          ? `Created by ${item.creatorName} (${item.creatorEmail})`
                          : `Owned by ${item.creatorName} (${item.creatorEmail})`}
                      </span>
                      <span>{item.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/models/${encodeURIComponent(item.modelName)}`}
                      className="rounded-xl border border-orange-500/30 px-3 py-2 text-xs font-semibold text-orange-300 transition-colors hover:bg-orange-500/10"
                    >
                      Open sandbox
                    </Link>
                    <form action={setDeploymentEnabled}>
                      <input
                        type="hidden"
                        name="deploymentId"
                        value={item.id}
                      />
                      <input
                        type="hidden"
                        name="enabled"
                        value={item.enabled ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${item.enabled ? "border-amber-700/30 text-amber-300/70 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300" : "border-emerald-500/30 text-emerald-300/80 hover:bg-emerald-500/10"}`}
                      >
                        {item.enabled
                          ? "Disable deployment"
                          : "Enable deployment"}
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-amber-50">
              Third-party hosted models
            </h2>
            <p className="mt-1 text-xs text-amber-500/50">
              Provider-backed models available to admins for direct sandbox
              testing.
            </p>
          </div>
          <span className="text-xs text-amber-600/40">
            {hostedModels.length}{" "}
            {hostedModels.length === 1 ? "model" : "models"}
          </span>
        </div>
        {hostedModels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center text-sm text-amber-200/55">
            No hosted models configured.
          </div>
        ) : (
          <div className="space-y-3">
            {hostedModels.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-amber-50">
                        {item.name}
                      </h3>
                      <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">
                        Hosted · {item.provider}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-amber-300/50">
                      {item.description || item.apiModelName}
                    </p>
                    <p className="mt-3 text-[11px] text-amber-500/50">
                      {item.apiModelName} · configured{" "}
                      {item.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href={`/models/${encodeURIComponent(item.name)}`}
                    className="shrink-0 rounded-xl border border-orange-500/30 px-3 py-2 text-xs font-semibold text-orange-300 transition-colors hover:bg-orange-500/10"
                  >
                    Open sandbox
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
