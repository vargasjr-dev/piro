import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../data/db";
import { deployment, model, user } from "../../../../data/schema";
import { setDeploymentEnabled } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const adminDeployments = await db
    .select({
      id: deployment.id,
      enabled: deployment.enabled,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      modelName: model.name,
      modelDescription: model.description,
      inferenceEndpoint: model.inferenceEndpoint,
      weightsR2Key: model.weightsR2Key,
      creatorName: user.name,
      creatorEmail: user.email,
    })
    .from(deployment)
    .innerJoin(model, eq(deployment.modelId, model.id))
    .innerJoin(user, eq(deployment.createdByUserId, user.id))
    .where(and(eq(deployment.isAdmin, true)))
    .orderBy(desc(deployment.createdAt));

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
            Piro operations
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
            Admin deployments
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-amber-200/55">
            Control which shared Piro deployments are available in the global
            model picker. Disabling a deployment removes it from user-facing
            model lists without deleting its underlying model.
          </p>
        </div>

        {adminDeployments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-amber-200/60">
              No admin deployments yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-amber-600/45">
              Shared deployments will appear here once they are registered.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {adminDeployments.map((item) => {
              const ready = Boolean(
                item.inferenceEndpoint && item.weightsR2Key,
              );

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-amber-50">
                          {item.modelName}
                        </h2>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            item.enabled
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                              : "border-amber-700/30 bg-amber-900/20 text-amber-500/70"
                          }`}
                        >
                          {item.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-amber-300/50">
                        {item.modelDescription || "No deployment description."}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-amber-500/50">
                        <span
                          className={
                            ready ? "text-emerald-300/70" : "text-amber-400/50"
                          }
                        >
                          {ready
                            ? "Stateful inference ready"
                            : "Deployment preparing"}
                        </span>
                        <span>
                          Created by {item.creatorName} ({item.creatorEmail})
                        </span>
                        <span>
                          {item.createdAt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    <form action={setDeploymentEnabled} className="shrink-0">
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
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          item.enabled
                            ? "border-amber-700/30 text-amber-300/70 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                            : "border-emerald-500/30 text-emerald-300/80 hover:bg-emerald-500/10"
                        }`}
                      >
                        {item.enabled
                          ? "Disable deployment"
                          : "Enable deployment"}
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
