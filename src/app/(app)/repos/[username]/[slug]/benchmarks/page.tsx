import Link from "next/link";
import { getRepositoryContext } from "~/lib/repository-context.server";
import { listRepositoryComponents } from "~/lib/repository-components";

export default async function BenchmarksPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const context = await getRepositoryContext(username, slug);
  if (!context) return null;

  const components = context.githubRepo
    ? await listRepositoryComponents(
        context.githubRepo.owner,
        context.githubRepo.repository,
        "benchmarks",
        context.accessToken,
      ).catch(() => [])
    : [];
  const basePath = `/repos/${username}/${context.repo.slug}/benchmarks`;

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-amber-100">Benchmarks</h2>
        <p className="text-xs text-amber-400/40 mt-0.5">
          {components.length} benchmark{components.length === 1 ? "" : "s"} in
          this repository
        </p>
      </div>

      {components.length === 0 ? (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-8 text-center">
          <p className="text-sm text-amber-400/50">No benchmarks found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {components.map((component) => (
            <Link
              key={component.path}
              href={`${`/repos/${username}/${context.repo.slug}/benchmarks`}/${encodeURIComponent(component.name)}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-900/15 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-300 flex items-center justify-center shrink-0">
                B
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-200/80">
                  {component.name}
                </p>
                <p className="text-[11px] text-amber-700/30 font-mono truncate">
                  {component.entrypoint
                    ? `${component.path}/${component.entrypoint}`
                    : component.path}
                </p>
              </div>
              <svg
                className="w-4 h-4 text-amber-800/30 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m9 18 6-6-6-6"
                />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
