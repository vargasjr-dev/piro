import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../../../data/db";
import { repository, trainingRun, model, modelTrainingRun, user } from "../../../../../../../data/schema";

export default async function RepoModelsPage({
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

  // Get completed training runs for this repo that have linked models
  const runs = await db
    .select({
      id: trainingRun.id,
      modelName: trainingRun.modelName,
      architecturePath: trainingRun.architecturePath,
      status: trainingRun.status,
      finalValAccuracy: trainingRun.finalValAccuracy,
      completedAt: trainingRun.completedAt,
    })
    .from(trainingRun)
    .where(and(eq(trainingRun.repositoryId, repo.id), eq(trainingRun.status, "complete")))
    .orderBy(desc(trainingRun.completedAt));

  // Find models linked to these runs
  const modelLinks = runs.length > 0
    ? await db
        .select()
        .from(modelTrainingRun)
        .where(
          // model_training_run has a unique trainingRunId, so we can just match
          eq(modelTrainingRun.trainingRunId, runs[0].id),
        )
        .limit(1)
    : [];

  // Fetch actual models
  const models = modelLinks.length > 0
    ? await db
        .select()
        .from(model)
        .where(eq(model.id, modelLinks[0].modelId))
        .limit(1)
    : [];

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-amber-100">Models</h2>
        <p className="text-xs text-amber-400/40 mt-0.5">
          Trained models from this repo. Weights stored in R2, inference via Modal.
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-8 text-center">
          <p className="text-sm text-amber-400/50">No trained models yet.</p>
          <Link
            href="/training/new"
            className="text-xs text-amber-500/50 hover:text-amber-300 transition-colors mt-2 inline-block"
          >
            Start a training run →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/training/${r.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-900/15 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-200/80">
                  {r.modelName ?? r.architecturePath.split("/").pop()}
                </p>
                <p className="text-[11px] text-amber-700/30 mt-0.5 font-mono">{r.architecturePath}</p>
              </div>
              {r.finalValAccuracy !== null && (
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono text-amber-300/60">
                    {(r.finalValAccuracy * 100).toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-amber-700/30">val acc</p>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
