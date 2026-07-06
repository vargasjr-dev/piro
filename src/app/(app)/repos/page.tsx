import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { repository, user } from "../../../../data/schema";

interface RepoRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  ownerUsername: string;
}

function RepoCard({ repo }: { repo: RepoRow }) {
  return (
    <Link
      href={`/repos/${repo.ownerUsername}/${repo.slug}`}
      className="block px-4 py-3.5 rounded-xl border border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600/40 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L12 3l9 4.5M3 7.5L12 12m-9-4.5v9L12 21m0-9l9-4.5m-9 4.5v9m9-13.5v9L12 21" />
            </svg>
            <h3 className="text-sm font-semibold text-amber-100">{repo.name}</h3>
          </div>
          {repo.description && (
            <p className="text-[11px] text-amber-600/40 leading-relaxed truncate max-w-xs">{repo.description}</p>
          )}
          <div className="flex items-center gap-3 text-[11px]">
            <span className="font-mono text-amber-500/40">{repo.ownerUsername}/{repo.slug}</span>
            <span className="text-amber-700/30">
              {new Date(repo.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </div>
        </div>
        <svg className="w-4 h-4 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

export default async function ReposPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const repos = await db
    .select({
      id: repository.id,
      name: repository.name,
      slug: repository.slug,
      description: repository.description,
      createdAt: repository.createdAt,
      ownerUsername: user.username,
    })
    .from(repository)
    .innerJoin(user, eq(repository.userId, user.id))
    .where(eq(repository.userId, session.user.id))
    .orderBy(desc(repository.createdAt));

  const rows: RepoRow[] = repos.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    ownerUsername: r.ownerUsername ?? "unknown",
  }));

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Repositories</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">Model development workspaces</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[280px] text-center">
            <p className="text-sm font-semibold text-amber-200/60">No repositories yet</p>
            <p className="text-xs text-amber-600/40 mt-1 max-w-xs">
              Create one with <code className="font-mono text-amber-500/50">piro repos create &lt;id&gt; --name &lt;name&gt;</code>
            </p>
          </div>
        ) : (
          rows.map((r) => <RepoCard key={r.id} repo={r} />)
        )}
      </div>
    </div>
  );
}
