import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import {
  repository,
  dataset,
  trainingRun,
  model,
  modelTrainingRun,
  user,
} from "../../../../../../data/schema";
import { githubRepositoryUrl } from "~/lib/github-repository";

export default async function RepoOverviewPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username: ownerHandle, slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [owner] = await db
    .select()
    .from(user)
    .where(eq(user.username, ownerHandle))
    .limit(1);

  if (!owner) notFound();

  const [repo] = await db
    .select()
    .from(repository)
    .where(and(eq(repository.userId, owner.id), eq(repository.slug, slug)))
    .limit(1);

  if (!repo) notFound();

  // Counts for overview stats
  const [datasetCount] = await db
    .select({ count: count() })
    .from(dataset)
    .where(eq(dataset.repositoryId, repo.id));

  const [runCount] = await db
    .select({ count: count() })
    .from(trainingRun)
    .where(eq(trainingRun.repositoryId, repo.id));

  const recentRuns = await db
    .select()
    .from(trainingRun)
    .where(eq(trainingRun.repositoryId, repo.id))
    .orderBy(desc(trainingRun.queuedAt))
    .limit(5);

  const githubRef =
    repo.githubOwner && repo.githubRepository
      ? { owner: repo.githubOwner, repository: repo.githubRepository }
      : null;
  const githubUrl = githubRef ? githubRepositoryUrl(githubRef) : null;

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-6">
      {/* Repo description */}
      {repo.description && (
        <p className="text-sm text-amber-400/50 leading-relaxed">
          {repo.description}
        </p>
      )}

      {/* Linked GitHub repository */}
      {githubRef && githubUrl ? (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-[#24292e] flex items-center justify-center shrink-0">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-white"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.81 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-100">
              View on GitHub
            </p>
            <p className="text-xs text-amber-600/40 font-mono truncate">
              {githubRef.owner}/{githubRef.repository}
            </p>
          </div>
          <svg
            className="w-4 h-4 text-amber-800/30 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14 5l7 7m0 0l-7 7m7-7H3"
            />
          </svg>
        </a>
      ) : (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-3.5">
          <p className="text-sm font-semibold text-amber-200/70">
            No GitHub repository linked
          </p>
          <p className="text-xs text-amber-600/40 mt-1">
            Architectures, benchmarks, and sources are unavailable until this
            Piro repository is connected to its external GitHub repository.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-3">
          <p className="text-2xl font-bold text-amber-100">
            {datasetCount?.count ?? 0}
          </p>
          <p className="text-xs text-amber-400/40 mt-0.5">Datasets</p>
        </div>
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-3">
          <p className="text-2xl font-bold text-amber-100">
            {runCount?.count ?? 0}
          </p>
          <p className="text-xs text-amber-400/40 mt-0.5">Training Runs</p>
        </div>
      </div>

      {/* Recent training runs */}
      {recentRuns.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-amber-300/60 uppercase tracking-wider mb-2">
            Recent Runs
          </h3>
          <div className="space-y-1.5">
            {recentRuns.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-900/15 bg-amber-900/5"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-amber-200/80">
                    {r.modelName ?? r.architecturePath}
                  </span>
                  <span className="text-[10px] text-amber-700/30 ml-2">
                    {r.epochs} epochs
                  </span>
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    r.status === "complete"
                      ? "text-emerald-400/60"
                      : r.status === "error"
                        ? "text-red-400/60"
                        : r.status === "running"
                          ? "text-orange-400/60"
                          : "text-amber-600/40"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
