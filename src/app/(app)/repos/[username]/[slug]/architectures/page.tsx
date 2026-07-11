import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../../data/db";
import { repository, user } from "../../../../../../../data/schema";

export default async function ArchitecturesPage({
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

  const githubUrl = `https://github.com/${ownerHandle}/${repo.slug}/tree/main/architectures`;

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-amber-100">Architectures</h2>
          <p className="text-xs text-amber-400/40 mt-0.5">
            Model definitions live in your repo at <code className="font-mono text-amber-600/40">architectures/</code>
          </p>
        </div>
        <Link
          href={githubUrl}
          target="_blank"
          className="text-xs text-amber-400/50 hover:text-amber-200 transition-colors flex items-center gap-1 shrink-0"
        >
          View on GitHub
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
      </div>

      <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-6 text-center">
        <p className="text-sm text-amber-400/50">Architectures are defined in your GitHub repo.</p>
        <p className="text-xs text-amber-600/30 mt-2">
          Each architecture is a directory with a <code className="font-mono">main.py</code>:
        </p>
        <div className="mt-3 inline-block text-left">
          <pre className="text-[11px] font-mono text-amber-600/40 bg-amber-950/30 rounded-lg px-3 py-2">{`architectures/
  ctm/
    main.py        # PiroModel subclass
  baseline-transformer/
    main.py`}</pre>
        </div>
      </div>
    </div>
  );
}
