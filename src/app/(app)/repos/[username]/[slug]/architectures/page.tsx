import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../../data/db";
import { account, repository, user } from "../../../../../../../data/schema";
import {
  listRepositoryArchitectures,
  resolveGitHubRepository,
  type RepositoryArchitecture,
} from "~/lib/github-repository";

export default async function ArchitecturesPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username: ownerHandle, slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, ownerHandle))
    .limit(1);

  if (!owner) notFound();

  const [repo] = await db
    .select({ slug: repository.slug })
    .from(repository)
    .where(and(eq(repository.userId, owner.id), eq(repository.slug, slug)))
    .limit(1);

  if (!repo) notFound();

  const [githubAccount] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, owner.id), eq(account.providerId, "github")))
    .limit(1);

  let architectures: RepositoryArchitecture[] = [];
  try {
    const githubRepo = await resolveGitHubRepository(
      ownerHandle,
      repo.slug,
      githubAccount?.accessToken,
    );
    if (githubRepo) {
      architectures = await listRepositoryArchitectures(
        githubRepo.owner,
        githubRepo.repository,
        githubAccount?.accessToken,
      );
    }
  } catch {
    architectures = [];
  }

  const basePath = `/repos/${ownerHandle}/${repo.slug}/architectures`;

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-amber-100">Architectures</h2>
          <p className="text-xs text-amber-400/40 mt-0.5">
            {architectures.length === 1
              ? "1 architecture defined in this repo"
              : `${architectures.length} architectures defined in this repo`}
          </p>
        </div>
      </div>

      {architectures.length === 0 ? (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-8 text-center">
          <p className="text-sm text-amber-400/50">No architectures found in this repo.</p>
          <p className="text-xs text-amber-600/30 mt-2">
            Add an architecture directory under <code className="font-mono">architectures/</code> and push it to GitHub.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {architectures.map((architecture) => (
            <Link
              key={architecture.path}
              href={`${basePath}/${encodeURIComponent(architecture.name)}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-900/15 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
                  <path d="M8 9.75 12 12l4-2.25M12 12v4.5" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-200/80">{architecture.name}</p>
                <p className="text-[11px] text-amber-700/30 font-mono truncate">{architecture.path}/main.py</p>
              </div>
              <svg className="w-4 h-4 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
