import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../../../data/db";
import { dataset, repository, user } from "../../../../../../../../data/schema";

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ username: string; slug: string; datasetId: string }>;
}) {
  const { username, slug, datasetId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [row] = await db
    .select({
      dataset,
      repository: { id: repository.id, slug: repository.slug },
      owner: { id: user.id, username: user.username },
    })
    .from(dataset)
    .innerJoin(repository, eq(dataset.repositoryId, repository.id))
    .innerJoin(user, eq(repository.userId, user.id))
    .where(
      and(
        eq(dataset.id, datasetId),
        eq(dataset.userId, session.user.id),
        eq(user.username, username),
        eq(repository.slug, slug),
      ),
    )
    .limit(1);

  if (!row) notFound();

  return (
    <div className="p-4 lg:p-6 max-w-3xl space-y-4">
      <Link
        href={`/repos/${username}/${slug}/datasets`}
        className="text-xs text-amber-400/50 hover:text-amber-200"
      >
        ← Datasets
      </Link>
      <div>
        <h2 className="text-xl font-semibold text-amber-100">
          {row.dataset.name}
        </h2>
        <p className="mt-1 text-xs font-mono text-amber-400/40">
          {row.dataset.sourcePath}
        </p>
      </div>
      <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 p-4 space-y-3">
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-amber-700/45">Status</span>
          <span
            className={
              row.dataset.generatedAt
                ? "text-emerald-300/70"
                : "text-amber-300/60"
            }
          >
            {row.dataset.generatedAt ? "Generated" : "Awaiting generation"}
          </span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-amber-700/45">Samples</span>
          <span className="text-amber-300/65">
            {row.dataset.sampleCount?.toLocaleString() ?? "Pending"}
          </span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-amber-700/45">Generated</span>
          <span className="text-amber-300/65">
            {row.dataset.generatedAt?.toLocaleString() ?? "Pending"}
          </span>
        </div>
      </div>
      <p className="text-xs text-amber-700/35 font-mono break-all">
        Storage prefix: {row.dataset.r2Prefix}
      </p>
    </div>
  );
}
