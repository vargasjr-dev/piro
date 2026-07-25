import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, isNull } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../data/db";
import {
  deployment,
  model,
  modelHostedApi,
  user,
} from "../../../../../data/schema";
import { createAdminDeployment } from "../actions";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const [models, users] = await Promise.all([
    db
      .select({
        id: model.id,
        name: model.name,
        description: model.description,
        parameterCount: model.parameterCount,
        inferenceEndpoint: model.inferenceEndpoint,
        weightsR2Key: model.weightsR2Key,
        createdAt: model.createdAt,
        ownerName: user.name,
        ownerEmail: user.email,
      })
      .from(model)
      .innerJoin(user, eq(model.userId, user.id))
      .leftJoin(modelHostedApi, eq(modelHostedApi.modelId, model.id))
      .where(isNull(modelHostedApi.id))
      .orderBy(desc(model.createdAt)),
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .orderBy(user.name),
  ]);

  const deploymentRows = await db
    .select({
      modelId: deployment.modelId,
      targetUserId: deployment.targetUserId,
    })
    .from(deployment)
    .where(eq(deployment.isAdmin, true));
  const deploymentKeys = new Set(
    deploymentRows.map(
      (item) => `${item.modelId}:${item.targetUserId ?? "global"}`,
    ),
  );

  return (
    <AdminShell current="Models">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
          Models
        </h1>
        <p className="mt-3 text-sm text-amber-200/55">
          Piro models available for global or user-specific deployment.
        </p>
      </div>
      {models.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center text-sm text-amber-200/55">
          No deployable Piro models yet.
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((item) => {
            const ready = Boolean(item.inferenceEndpoint && item.weightsR2Key);
            const globalKey = `${item.id}:global`;
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-amber-50">
                        {item.name}
                      </h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ready ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-700/30 bg-amber-900/20 text-amber-500/70"}`}
                      >
                        {ready ? "Inference ready" : "Preparing"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-amber-300/50">
                      {item.description || "No description."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-amber-500/50">
                      <span>
                        Owner: {item.ownerName} ({item.ownerEmail})
                      </span>
                      <span>
                        {item.parameterCount?.toLocaleString() ?? "—"}{" "}
                        parameters
                      </span>
                      <span>{item.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="w-full shrink-0 rounded-xl border border-amber-900/20 bg-amber-900/5 p-3 lg:w-[310px]">
                    <p className="mb-3 text-xs font-semibold text-amber-200/70">
                      Create deployment
                    </p>
                    <div className="space-y-3">
                      <form action={createAdminDeployment}>
                        <input type="hidden" name="modelId" value={item.id} />
                        <input type="hidden" name="targetUserId" value="" />
                        <button
                          type="submit"
                          disabled={deploymentKeys.has(globalKey)}
                          className="w-full rounded-lg border border-orange-500/30 px-3 py-2 text-left text-xs font-semibold text-orange-300 transition-colors enabled:hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:border-amber-900/20 disabled:text-amber-600/45"
                        >
                          {deploymentKeys.has(globalKey)
                            ? "Global deployment exists"
                            : "Deploy globally"}
                        </button>
                      </form>
                      <form
                        action={createAdminDeployment}
                        className="space-y-2"
                      >
                        <input type="hidden" name="modelId" value={item.id} />
                        <label className="block text-[11px] text-amber-500/55">
                          Specific user
                          <select
                            name="targetUserId"
                            required
                            className="mt-1 w-full rounded-lg border border-amber-900/30 bg-[#0d0a08] px-2 py-2 text-xs text-amber-100 outline-none focus:border-orange-500/50"
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Choose a user
                            </option>
                            {users.map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.email})
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="w-full rounded-lg border border-amber-700/30 px-3 py-2 text-left text-xs font-semibold text-amber-200/75 transition-colors hover:bg-amber-900/20"
                        >
                          Deploy for user
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
