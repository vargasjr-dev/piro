import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchitectureDetail } from "~/components/ArchitectureDetail";
import { getRepositoryArchitecture } from "~/lib/github-repository";
import { getRepositoryContext } from "~/lib/repository-context.server";

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ username: string; slug: string; architecture: string }>;
}) {
  const {
    username: ownerHandle,
    slug,
    architecture: encodedArchitecture,
  } = await params;
  const architectureName = decodeURIComponent(encodedArchitecture);
  const context = await getRepositoryContext(ownerHandle, slug);
  if (!context) return null;

  const { repo, githubRepo, accessToken } = context;
  let architecture = null;
  if (githubRepo) {
    try {
      architecture = await getRepositoryArchitecture(
        githubRepo.owner,
        githubRepo.repository,
        architectureName,
        accessToken,
        AbortSignal.timeout(10_000),
      );
    } catch {
      architecture = null;
    }
  }

  if (!architecture) notFound();


  return (
    <div className="p-4 lg:p-6 max-w-4xl space-y-4">
      <Link
        href={`/repos/${ownerHandle}/${repo.slug}/architectures`}
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
        Architectures
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-amber-100">
            {architecture.name}
          </h2>
          <p className="text-xs text-amber-400/40 mt-1 font-mono">
            {architecture.path}
          </p>
        </div>
      </div>

      <ArchitectureDetail source={architecture.source} />
    </div>
  );
}
