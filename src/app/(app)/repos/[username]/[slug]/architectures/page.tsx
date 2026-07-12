import Link from "next/link";
import { getRepositoryContext } from "~/lib/repository-context.server";
import {
  listRepositoryArchitectures,
  type RepositoryArchitecture,
} from "~/lib/github-repository";

export default async function ArchitecturesPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const context = await getRepositoryContext(username, slug);
  if (!context) return null;

  let architectures: RepositoryArchitecture[] = [];
  if (context.githubRepo) {
    try {
      architectures = await listRepositoryArchitectures(
        context.githubRepo.owner,
        context.githubRepo.repository,
        context.accessToken,
        AbortSignal.timeout(10_000),
      );
    } catch {
      architectures = [];
    }
  }

  const basePath = `/repos/${username}/${context.repo.slug}/architectures`;

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-amber-100">Architectures</h2>
        <p className="text-xs text-amber-400/40 mt-0.5">
          {architectures.length} architecture
          {architectures.length === 1 ? "" : "s"} in this repository
        </p>
      </div>

      {architectures.length === 0 ? (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-8 text-center">
          <p className="text-sm text-amber-400/50">No architectures found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {architectures.map((architecture) => (
            <Link
              key={architecture.path}
              href={`${basePath}/${encodeURIComponent(architecture.name)}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-900/15 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
                A
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-200/80">
                  {architecture.name}
                </p>
                <p className="text-[11px] text-amber-700/30 font-mono truncate">
                  {architecture.entrypoint
                    ? `${architecture.path}/${architecture.entrypoint}`
                    : architecture.path}
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
