import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../data/db";
import {
  benchmarkRun,
  benchmarkSuiteRun,
  dataset,
  user,
} from "../../../../../data/schema";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function formatDate(value: Date): string {
  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pageHref(page: number): string {
  return page <= 1 ? "/admin/evaluations" : `/admin/evaluations?page=${page}`;
}

export default async function AdminEvaluationsPage({
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
    db.select({ count: count() }).from(benchmarkSuiteRun),
    db
      .select({
        id: benchmarkSuiteRun.id,
        status: benchmarkSuiteRun.status,
        datasetId: benchmarkSuiteRun.datasetId,
        datasetName: dataset.name,
        userEmail: user.email,
        userName: user.name,
        targets: benchmarkSuiteRun.targets,
        queuedAt: benchmarkSuiteRun.queuedAt,
        completedAt: benchmarkSuiteRun.completedAt,
        error: benchmarkSuiteRun.error,
        resultCount: count(benchmarkRun.id),
      })
      .from(benchmarkSuiteRun)
      .leftJoin(dataset, eq(dataset.id, benchmarkSuiteRun.datasetId))
      .leftJoin(user, eq(user.id, benchmarkSuiteRun.userId))
      .leftJoin(benchmarkRun, eq(benchmarkRun.suiteRunId, benchmarkSuiteRun.id))
      .groupBy(benchmarkSuiteRun.id, dataset.name, user.email, user.name)
      .orderBy(desc(benchmarkSuiteRun.queuedAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const total = Number(totalRow[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  return (
    <AdminShell current="Evaluations">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300/60">
            Evaluation history
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
            Evaluations
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-amber-200/55">
            Browse dataset and model-target runs, then open an evaluation to
            inspect every result.
          </p>
        </div>
        <div className="text-sm text-amber-200/50">
          {total} {total === 1 ? "run" : "runs"}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-amber-900/30 bg-[#100c0a]">
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-amber-200/50">
            No evaluation runs yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-amber-900/30 bg-amber-950/20 text-xs uppercase tracking-[0.14em] text-amber-300/45">
                <tr>
                  <th className="px-5 py-4 font-semibold">Dataset</th>
                  <th className="px-5 py-4 font-semibold">Targets</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Results</th>
                  <th className="px-5 py-4 font-semibold">Queued</th>
                  <th className="px-5 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-900/20">
                {rows.map((row) => {
                  const targets = parseJsonArray(row.targets);
                  return (
                    <tr key={row.id} className="text-amber-100/80">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-amber-50">
                          {row.datasetName ?? "Deleted dataset"}
                        </div>
                        <div className="mt-1 text-xs text-amber-200/50">
                          {row.userName || row.userEmail || "Unknown user"}
                        </div>
                        <div className="mt-1 font-mono text-[0.68rem] text-amber-300/35">
                          {row.datasetId ?? "no dataset id"}
                        </div>
                      </td>
                      <td className="max-w-xs px-5 py-4 text-amber-200/65">
                        {targets.length ? targets.join(", ") : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-amber-700/30 px-2.5 py-1 text-xs font-semibold capitalize text-amber-200/75">
                          {row.status}
                        </span>
                        {row.error ? (
                          <div className="mt-2 max-w-xs text-xs text-red-300/80">
                            {row.error}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-amber-200/70">
                        {row.resultCount}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-amber-200/55">
                        {formatDate(row.queuedAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/evaluations/${row.id}`}
                          className="font-semibold text-orange-300 hover:text-orange-200"
                        >
                          View results →
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
          {hasPrevious ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-lg border border-amber-800/40 px-3 py-2 text-amber-200/75 hover:border-orange-300/50 hover:text-amber-50"
            >
              Previous
            </Link>
          ) : null}
          {hasNext ? (
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
