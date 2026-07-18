import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceGenerationRunDetail } from "~/components/SourceGenerationRunDetail";
import { getRepositoryContext } from "~/lib/repository-context.server";
import {
  getSourceGenerationRun,
  serializeSourceGenerationRun,
} from "~/lib/source-generation-runs.server";

export default async function SourceGenerationRunPage({
  params,
}: {
  params: Promise<{
    username: string;
    slug: string;
    source: string;
    runId: string;
  }>;
}) {
  const {
    username: ownerHandle,
    slug,
    source: encodedSource,
    runId,
  } = await params;
  const sourceName = decodeURIComponent(encodedSource);
  const context = await getRepositoryContext(ownerHandle, slug);
  if (!context) return null;

  const run = await getSourceGenerationRun({
    id: runId,
    userId: context.owner.id,
    repositoryId: context.repo.id,
  });
  if (!run || run.sourceName !== sourceName) notFound();

  const sourceHref = `/repos/${encodeURIComponent(ownerHandle)}/${encodeURIComponent(context.repo.slug)}/sources/${encodeURIComponent(sourceName)}`;
  const datasetHref = run.dataset
    ? `/repos/${encodeURIComponent(ownerHandle)}/${encodeURIComponent(context.repo.slug)}/datasets/${encodeURIComponent(run.dataset.id)}`
    : null;

  return (
    <div className="p-4 lg:p-6 max-w-3xl space-y-4">
      <Link
        href={sourceHref}
        className="inline-flex items-center gap-1.5 text-xs text-amber-400/50 hover:text-amber-200 transition-colors"
      >
        ← {sourceName}
      </Link>
      <div>
        <h2 className="text-xl font-semibold text-amber-100">Generation run</h2>
        <p className="text-xs text-amber-400/40 mt-1 font-mono">{run.id}</p>
      </div>
      <SourceGenerationRunDetail
        initialRun={serializeSourceGenerationRun(run)}
        streamEndpoint={`${sourceHref}/runs/${encodeURIComponent(run.id)}/stream`}
        datasetHref={datasetHref}
        sourceHref={sourceHref}
      />
    </div>
  );
}
