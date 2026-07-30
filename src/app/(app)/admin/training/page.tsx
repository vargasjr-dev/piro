import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../data/db";
import { dataset, trainingRun, user } from "../../../../../data/schema";
import { deriveLiveTrainingMetrics } from "~/lib/training-run-metrics";
import { formatAge, formatDate } from "~/lib/training-run-admin";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function pageHref(page: number): string {
  return page <= 1 ? "/admin/training" : `/admin/training?page=${page}`;
}

function statusClass(status: string): string {
  if (status === "complete")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "error") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (status === "cancelled")
    return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  if (status === "running")
    return "border-orange-400/35 bg-orange-400/10 text-orange-200";
  return "border-amber-700/30 bg-amber-900/15 text-amber-200/75";
}

export default async function AdminTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const requestedPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const [totalRow, rows] = await Promise.all([
    db.select({ count: count() }).from(trainingRun),
    db
      .select({
        run: trainingRun,
        datasetName: dataset.name,
        userEmail: user.email,
        userName: user.name,
      })
      .from(trainingRun)
      .leftJoin(dataset, eq(dataset.id, trainingRun.datasetId))
      .leftJoin(user, eq(user.id, trainingRun.userId))
      .orderBy(desc(trainingRun.queuedAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const total = Number(totalRow[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();

  return (
    <AdminShell current="Training">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300/60">
            Runtime control plane
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
            Training runs
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-amber-200/55">
            Heartbeats show that a worker is alive. Progress freshness and
            checkpoint age show whether it is actually advancing.
          </p>
        </div>
        <div className="text-sm text-amber-200/50">
          {total} {total === 1 ? "run" : "runs"}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-amber-900/30 bg-[#100c0a]">
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-amber-200/50">
            No training runs yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-amber-900/30 bg-amber-950/20 text-xs uppercase tracking-[0.14em] text-amber-300/45">
                <tr>
                  <th className="px-5 py-4 font-semibold">Run</th>
                  <th className="px-5 py-4 font-semibold">Owner / dataset</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Progress</th>
                  <th className="px-5 py-4 font-semibold">Signals</th>
                  <th className="px-5 py-4 font-semibold">Queued</th>
                  <th className="px-5 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-900/20">
                {rows.map(({ run, datasetName, userEmail, userName }) => {
                  const metrics = deriveLiveTrainingMetrics(run, now);
                  const progressLabel =
                    metrics.progressStep === null
                      ? "—"
                      : `${metrics.progressStep}/${metrics.progressMaxSteps}`;
                  const progressFreshness = metrics.progressUpdatedAt
                    ? formatAge(new Date(metrics.progressUpdatedAt), now)
                    : "never";
                  return (
                    <tr key={run.id} className="text-amber-100/80">
                      <td className="max-w-xs px-5 py-4">
                        <Link
                          href={`/admin/training/${run.id}`}
                          className="font-semibold text-amber-50 hover:text-orange-200"
                        >
                          {run.modelName ?? "Unnamed run"}
                        </Link>
                        <div className="mt-1 font-mono text-[0.68rem] text-amber-300/35">
                          {run.id}
                        </div>
                        <div className="mt-1 text-xs text-amber-200/45">
                          {run.architecturePath}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-amber-50/85">
                          {userName || userEmail || "Unknown user"}
                        </div>
                        <div className="mt-1 text-xs text-amber-200/50">
                          {datasetName ?? "Deleted dataset"}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(run.status)}`}
                        >
                          {run.status}
                        </span>
                        {run.error ? (
                          <div className="mt-2 max-w-xs text-xs text-red-300/80">
                            {run.error}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 align-top text-amber-100/80">
                        <div className="font-semibold">{progressLabel}</div>
                        <div className="mt-1 text-xs text-amber-200/45">
                          {metrics.progressPercent === null
                            ? "No progress"
                            : `${metrics.progressPercent}%`}
                        </div>
                      </td>
                      <td className="min-w-44 px-5 py-4 align-top text-xs text-amber-200/55">
                        <div>
                          <span className="text-amber-300/40">Heartbeat:</span>{" "}
                          {formatAge(run.heartbeatAt, now)}
                        </div>
                        <div className="mt-1">
                          <span className="text-amber-300/40">Progress:</span>{" "}
                          {progressFreshness}
                        </div>
                        <div className="mt-1">
                          <span className="text-amber-300/40">Checkpoint:</span>{" "}
                          {formatAge(run.checkpointAt, now)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-amber-200/55">
                        {formatDate(run.queuedAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/training/${run.id}`}
                          className="font-semibold text-orange-300 hover:text-orange-200"
                        >
                          Inspect →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-amber-300/45">
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-lg border border-amber-800/40 px-3 py-2 text-amber-200/75 hover:border-orange-300/50 hover:text-amber-50"
            >
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-lg border border-amber-800/40 px-3 py-2 text-amber-200/75 hover:border-orange-300/50 hover:text-amber-50"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
