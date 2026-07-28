import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, or } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../../data/db";
import { deployment, model, user } from "../../../../../../data/schema";
import { AdminShell } from "../../AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const { id } = await params;
  const [account] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  if (!account) notFound();

  const deployments = await db
    .select({
      id: deployment.id,
      modelId: model.id,
      modelName: model.name,
      enabled: deployment.enabled,
      isAdmin: deployment.isAdmin,
      targetUserId: deployment.targetUserId,
      createdAt: deployment.createdAt,
    })
    .from(deployment)
    .innerJoin(model, eq(model.id, deployment.modelId))
    .where(
      or(eq(deployment.createdByUserId, id), eq(deployment.targetUserId, id)),
    )
    .orderBy(desc(deployment.createdAt));

  return (
    <AdminShell current="Users">
      <Link
        href="/admin/users"
        className="text-sm font-semibold text-orange-300 hover:text-orange-200"
      >
        ← Back to users
      </Link>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300/60">
            User account
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
            {account.username || account.name}
          </h1>
          <p className="mt-2 text-sm text-amber-200/55">{account.email}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${account.role === "admin" ? "border-orange-500/25 bg-orange-500/10 text-orange-300" : "border-amber-700/30 bg-amber-900/20 text-amber-300/75"}`}
        >
          {account.role === "admin" ? "Admin" : "User"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-900/30 bg-[#100c0a] p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-300/45">
            Joined
          </div>
          <div className="mt-2 text-sm text-amber-100/80">
            {account.createdAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
        <div className="rounded-xl border border-amber-900/30 bg-[#100c0a] p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-300/45">
            Deployments
          </div>
          <div className="mt-2 text-sm text-amber-100/80">
            {deployments.length}
          </div>
        </div>
        <div className="rounded-xl border border-amber-900/30 bg-[#100c0a] p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-300/45">
            Last updated
          </div>
          <div className="mt-2 text-sm text-amber-100/80">
            {account.updatedAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-amber-50">Deployments</h2>
            <p className="mt-1 text-xs text-amber-500/50">
              Deployments created by or assigned to this account.
            </p>
          </div>
        </div>
        {deployments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center text-sm text-amber-200/55">
            No deployments for this user.
          </div>
        ) : (
          <div className="space-y-3">
            {deployments.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-amber-50">
                      {item.modelName}
                    </h3>
                    <p className="mt-1 text-xs text-amber-500/55">
                      {item.isAdmin
                        ? item.targetUserId === account.id
                          ? "Assigned deployment"
                          : "Global deployment"
                        : "Private deployment"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.enabled ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-700/30 bg-amber-900/20 text-amber-500/70"}`}
                    >
                      {item.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className="text-xs text-amber-600/45">
                      {item.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
