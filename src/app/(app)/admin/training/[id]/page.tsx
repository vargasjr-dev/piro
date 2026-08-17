import Link from "next/link";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../../data/db";
import { dataset, trainingRun, user } from "../../../../../../data/schema";
import { deriveTrainingRunMetrics } from "~/lib/training-run-metrics";
import {
  formatArchitecturePath,
  formatDate,
  formatSourcePath,
  isTrainingRunCancellable,
  parseJsonRecord,
} from "~/lib/training-run-admin";
import { AdminShell } from "../../AdminShell";
import { CancelTrainingRunButton } from "../CancelTrainingRunButton";
import { TrainingRunEventHistory } from "./TrainingRunEventHistory";
import { getTrainingRunEventPage } from "~/lib/training-run-events.server";

export const dynamic = "force-dynamic";

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

export default async function AdminTrainingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const { id } = await params;
  const { tab: requestedTab } = await searchParams;
  const activeTab = requestedTab === "timeline" ? "timeline" : "summary";
  const [row] = await db
    .select({
      run: trainingRun,
      datasetName: dataset.name,
      datasetSourcePath: dataset.sourcePath,
      userEmail: user.email,
      userName: user.name,
    })
    .from(trainingRun)
    .leftJoin(dataset, eq(dataset.id, trainingRun.datasetId))
    .leftJoin(user, eq(user.id, trainingRun.userId))
    .where(eq(trainingRun.id, id))
    .limit(1);
  if (!row) notFound();

  const now = new Date();
  const metrics = deriveTrainingRunMetrics(row.run, now);
  const config = parseJsonRecord(row.run.configJson);
  const eventPage = await getTrainingRunEventPage(
    row.run.id,
    0,
    row.run,
    row.run.workerEventLogJson,
  );

  return (
    <AdminShell current="Training">
      <Link
        href="/admin/training"
        className="text-sm font-semibold text-orange-300 hover:text-orange-200"
      >
        ← Back to training runs
      </Link>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300/60">
            Training run detail
          </p>
          <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
            {row.run.modelName ?? "Unnamed run"}
          </h1>
          <p className="mt-3 font-mono text-xs text-amber-300/45">
            {row.run.id}
          </p>
          <p className="mt-2 text-sm text-amber-200/55">
            {row.userName || row.userEmail || "Unknown user"} ·{" "}
            {row.datasetName ?? "Deleted dataset"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold capitalize ${statusClass(row.run.status)}`}
          >
            {row.run.status}
          </span>
          {isTrainingRunCancellable(row.run) ? (
            <CancelTrainingRunButton runId={row.run.id} />
          ) : null}
        </div>
      </div>

      <nav
        aria-label="Training run sections"
        className="mt-8 flex gap-2 border-b border-amber-900/30"
      >
        {(
          [
            ["summary", "Summary"],
            ["timeline", "Timeline"],
          ] as const
        ).map(([tab, label]) => (
          <Link
            key={tab}
            href={
              tab === "summary"
                ? `/admin/training/${id}`
                : `/admin/training/${id}?tab=timeline`
            }
            aria-current={activeTab === tab ? "page" : undefined}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === tab
                ? "border-orange-300 text-orange-200"
                : "border-transparent text-amber-200/50 hover:border-amber-700/60 hover:text-amber-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {activeTab === "timeline" ? (
        <div className="mt-8">
          <TrainingRunEventHistory runId={row.run.id} initialPage={eventPage} />
        </div>
      ) : (
        <>
          {row.run.error ? (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200/85">
              {row.run.error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Progress",
                metrics.progressStep === null
                  ? "—"
                  : `${metrics.progressStep} / ${metrics.progressMaxSteps}`,
              ],
              [
                "Expected completion",
                metrics.estimatedCompletionAt
                  ? formatDate(new Date(metrics.estimatedCompletionAt))
                  : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-amber-900/30 bg-[#100c0a] p-4"
              >
                <div className="text-xs uppercase tracking-[0.14em] text-amber-300/45">
                  {label}
                </div>
                <div className="mt-2 text-sm font-semibold text-amber-100/85">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Architecture",
                formatArchitecturePath(row.run.architecturePath),
              ],
              ["Source", formatSourcePath(row.datasetSourcePath)],
              ["GPU", row.run.gpuType ?? "—"],
              [
                "Estimated cost",
                metrics.estimatedCostUsd === null
                  ? "—"
                  : `$${metrics.estimatedCostUsd.toFixed(6)}`,
              ],
              ["Queued", formatDate(row.run.queuedAt)],
              ["Started", formatDate(row.run.startedAt)],
              ["Completed", formatDate(row.run.completedAt)],
              ["Timeout", formatDate(row.run.timeoutAt)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-amber-900/20 bg-black/10 p-4"
              >
                <div className="text-xs uppercase tracking-[0.14em] text-amber-300/40">
                  {label}
                </div>
                <div className="mt-2 break-words text-sm text-amber-100/75">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <section className="mt-8 rounded-2xl border border-amber-900/30 bg-[#100c0a] p-5">
            <h2 className="text-lg font-bold text-amber-50">
              Run configuration
            </h2>
            <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-black/25 p-4 text-xs leading-relaxed text-amber-200/65">
              {JSON.stringify(config, null, 2)}
            </pre>
          </section>
        </>
      )}
    </AdminShell>
  );
}
