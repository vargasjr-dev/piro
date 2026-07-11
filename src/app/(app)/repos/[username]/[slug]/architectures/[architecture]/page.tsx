import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../../../data/db";
import { account, repository, user } from "../../../../../../../../data/schema";
import { getRepositoryArchitecture } from "~/lib/github-repository";

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ username: string; slug: string; architecture: string }>;
}) {
  const {
    username: ownerHandle,
    slug,
    architecture: encodedArchitecture,
  } = await params;
  const architectureName = decodeURIComponent(encodedArchitecture);
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

  let architecture = null;
  try {
    architecture = await getRepositoryArchitecture(
      ownerHandle,
      repo.slug,
      architectureName,
      githubAccount?.accessToken,
    );
  } catch {
    architecture = null;
  }

  if (!architecture) notFound();

  return (
    <div className="p-4 lg:p-6 max-w-4xl space-y-4">
      <Link
        href={`/repos/${ownerHandle}/${repo.slug}/architectures`}
        className="inline-flex items-center gap-1.5 text-xs text-amber-400/50 hover:text-amber-200 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
        </svg>
        Architectures
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-amber-100">{architecture.name}</h2>
          <p className="text-xs text-amber-400/40 mt-1 font-mono">{architecture.path}</p>
        </div>
        <a
          href={architecture.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-amber-400/50 hover:text-amber-200 transition-colors flex items-center gap-1 shrink-0"
        >
          GitHub
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
      </div>

      <pre className="rounded-xl border border-amber-900/20 bg-[#13100c] p-4 overflow-x-auto text-xs leading-relaxed text-amber-200/70 font-mono">
        <code>{architecture.source ?? "Source unavailable."}</code>
      </pre>
    </div>
  );
}
