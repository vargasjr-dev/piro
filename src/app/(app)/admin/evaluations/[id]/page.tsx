import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../../data/db";
import {
  benchmarkRun,
  benchmarkSuiteRun,
  dataset,
  user,
} from "../../../../../../data/schema";
import { AdminShell } from "../../AdminShell";

export const dynamic = "force-dynamic";

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatDate(value: Date | null): string {
  return value
    ? value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

export default async function AdminEvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const { id } = await params;
  const [row] = await db
    .select({
      suite: benchmarkSuiteRun,
      datasetName: dataset.name,
      datasetSourcePath: dataset.sourcePath,
      userEmail: user.email,
      userName: user.name,
    })
    .from(benchmarkSuiteRun)
    .leftJoin(dataset, eq(dataset.id, benchmarkSuiteRun.datasetId))
    .leftJoin(user, eq(user.id, benchmarkSuiteRun.userId))
    .where(eq(benchmarkSuiteRun.id, id))
    .limit(1);
  if (!row) notFound();

  const results = await db
    .select()
    .from(benchmarkRun)
    .where(eq(benchmarkRun.suiteRunId, id))
    .orderBy(desc(benchmarkRun.ranAt));

  return (
    <AdminShell current="Evaluations">
      <Link
        href="/admin/evaluations"
        className="text-sm font-semibold text-orange-300 hover:text-orange-200"
      >
        ← Back to evaluations
      </Link>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300/60">
            Evaluation results
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
            {row.datasetName ?? "Deleted dataset"}
          </h1>
          <p className="mt-3 text-sm text-amber-200/55">
            {row.datasetSourcePath ?? "Dataset metadata unavailable"}
          </p>
          <p className="mt-2 text-xs text-amber-200/45">
            {row.userName || row.userEmail || "Unknown user"}
          </p>
        </div>
        <span className="rounded-full border border-amber-700/30 px-3 py-1.5 text-sm font-semibold capitalize text-amber-200/75">
          {row.suite.status}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-900/30 bg-[#100c0a] p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-300/45">
            Queued
          </div>
          <div className="mt-2 text-sm text-amber-100/80">
            {formatDate(row.suite.queuedAt)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-900/30 bg-[#100c0a] p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-300/45">
            Completed
          </div>
          <div className="mt-2 text-sm text-amber-100/80">
            {formatDate(row.suite.completedAt)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-900/30 bg-[#100c0a] p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-300/45">
            Results
          </div>
          <div className="mt-2 text-sm text-amber-100/80">{results.length}</div>
        </div>
      </div>

      {row.suite.error ? (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200/85">
          {row.suite.error}
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-amber-900/30 bg-[#100c0a] px-5 py-12 text-center text-sm text-amber-200/50">
            No result rows have arrived yet.
          </div>
        ) : (
          results.map((result) => {
            const metadata = parseJson(result.metadata);
            return (
              <article
                key={result.id}
                className="rounded-2xl border border-amber-900/30 bg-[#100c0a] p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-amber-50">
                      {String(metadata?.modelName ?? result.target)}
                    </h2>
                    <p className="mt-1 font-mono text-xs text-amber-300/40">
                      {result.target}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-orange-200">
                      {(result.score * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-amber-300/45">score</div>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-amber-300/40">
                      Cost
                    </div>
                    <div className="mt-1 text-amber-100/75">
                      {result.costUsd === null
                        ? "Provider billed"
                        : `$${result.costUsd.toFixed(6)}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-amber-300/40">
                      Duration
                    </div>
                    <div className="mt-1 text-amber-100/75">
                      {result.durationMs ?? 0} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-amber-300/40">
                      Input tokens
                    </div>
                    <div className="mt-1 text-amber-100/75">
                      {formatNumber(metadata?.inputTokens)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-amber-300/40">
                      Output tokens
                    </div>
                    <div className="mt-1 text-amber-100/75">
                      {formatNumber(metadata?.outputTokens)}
                    </div>
                  </div>
                </div>
                <details className="mt-5 border-t border-amber-900/20 pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-amber-200/65 hover:text-amber-100">
                    Show metadata
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs leading-relaxed text-amber-200/60">
                    {JSON.stringify(metadata ?? {}, null, 2) as string}
                  </pre>
                </details>
              </article>
            );
          })
        )}
      </div>
    </AdminShell>
  );
}
