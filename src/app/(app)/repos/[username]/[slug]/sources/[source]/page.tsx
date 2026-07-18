import Link from "next/link";
import { notFound } from "next/navigation";
import { RepositoryComponentDetail } from "~/components/RepositoryComponentDetail";
import { getRepositoryComponent } from "~/lib/github-repository";
import { getRepositoryContext } from "~/lib/repository-context.server";

export default async function SourcePage({
  params,
}: {
  params: Promise<{ username: string; slug: string; source: string }>;
}) {
  const { username: ownerHandle, slug, source: encodedSource } = await params;
  const sourceName = decodeURIComponent(encodedSource);
  const context = await getRepositoryContext(ownerHandle, slug);
  if (!context) return null;

  const component = context.githubRepo
    ? await getRepositoryComponent(
        context.githubRepo.owner,
        context.githubRepo.repository,
        "sources",
        sourceName,
        context.accessToken,
        AbortSignal.timeout(10_000),
      ).catch(() => null)
    : null;

  if (!component) notFound();

  return (
    <div className="p-4 lg:p-6 max-w-4xl space-y-4">
      <Link
        href={`/repos/${ownerHandle}/${context.repo.slug}/sources`}
        className="inline-flex items-center gap-1.5 text-xs text-amber-400/50 hover:text-amber-200 transition-colors"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m15 18-6-6 6-6"
          />
        </svg>
        Sources
      </Link>

      <div>
        <h2 className="text-xl font-semibold text-amber-100">
          {component.name}
        </h2>
        <p className="text-xs text-amber-400/40 mt-1 font-mono">
          {component.path}/{component.entrypoint}
        </p>
      </div>

      <RepositoryComponentDetail
        kind="source"
        name={component.name}
        path={component.path}
        entrypoint={component.entrypoint}
        source={component.source}
        actionEndpoint={`/api/repos/${encodeURIComponent(ownerHandle)}/${encodeURIComponent(context.repo.slug)}/sources/${encodeURIComponent(component.name)}/generate`}
        actionLabel="Generate dataset"
      />
    </div>
  );
}
