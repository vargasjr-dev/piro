import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../../data/db";
import { repository, user } from "../../../../../../../data/schema";

export default async function SourcesPage({
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

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-amber-100">Sources</h2>
          <p className="text-xs text-amber-400/40 mt-0.5">
            Data generation scripts live in your repo at <code className="font-mono text-amber-600/40">sources/</code>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-6 text-center">
        <p className="text-sm text-amber-400/50">Sources are defined in your GitHub repo.</p>
        <p className="text-xs text-amber-600/30 mt-2">
          Each source is a directory with a <code className="font-mono">main.py</code> that outputs JSONL:
        </p>
        <div className="mt-3 inline-block text-left">
          <pre className="text-[11px] font-mono text-amber-600/40 bg-amber-950/30 rounded-lg px-3 py-2">{`sources/
  counter/
    main.py        # generate --split train --n 50000
  sequences/
    main.py`}</pre>
        </div>
        <p className="text-xs text-amber-600/30 mt-3">
          Run <code className="font-mono text-amber-500/40">piro sources generate</code> to create a dataset from a source.
        </p>
      </div>
    </div>
  );
}
