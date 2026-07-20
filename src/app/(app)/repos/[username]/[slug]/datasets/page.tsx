import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../../../data/db";
import { repository, dataset, user } from "../../../../../../../data/schema";

export default async function DatasetsPage({
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

  const datasets = await db
    .select()
    .from(dataset)
    .where(eq(dataset.repositoryId, repo.id))
    .orderBy(desc(dataset.createdAt));

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-amber-100">Datasets</h2>
        <p className="text-xs text-amber-400/40 mt-0.5">
          Generated data outputs stored in R2. Created by running source
          scripts.
        </p>
      </div>

      {datasets.length === 0 ? (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-8 text-center">
          <p className="text-sm text-amber-400/50">
            No datasets generated yet.
          </p>
          <p className="text-xs text-amber-600/30 mt-2">
            Generate it from the repository source page.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {datasets.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-900/15 bg-amber-900/5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-200/80">
                  {d.name}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-amber-700/30 mt-0.5">
                  <span className="font-mono">{d.sourcePath}</span>
                  {d.sampleCount && (
                    <span>{d.sampleCount.toLocaleString()} samples</span>
                  )}
                </div>
              </div>
              {d.generatedAt ? (
                <span className="text-[10px] text-emerald-400/50 font-medium">
                  generated
                </span>
              ) : (
                <span className="text-[10px] text-amber-600/40 italic">
                  not generated
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
