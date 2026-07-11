import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { repository, user } from "../../../../../../data/schema";

const TABS = [
  { label: "Overview", href: "" },
  { label: "Architectures", href: "/architectures" },
  { label: "Benchmarks", href: "/benchmarks" },
  { label: "Sources", href: "/sources" },
  { label: "Datasets", href: "/datasets" },
  { label: "Models", href: "/models" },
];

export default async function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const basePath = `/repos/${ownerHandle}/${slug}`;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Repo header */}
      <div className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-amber-900/20 shrink-0">
        <Link href="/repos" className="text-amber-600/40 hover:text-amber-400/70 transition-colors">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600/40 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L12 3l9 4.5M3 7.5L12 12m-9-4.5v9L12 21m0-9l9-4.5m-9 4.5v9m9-13.5v9L12 21" />
            </svg>
            <h1 className="text-amber-100 font-bold text-sm tracking-tight truncate">{repo.name}</h1>
          </div>
          {repo.description && (
            <p className="text-[11px] text-amber-400/40 mt-0.5 truncate max-w-md">{repo.description}</p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 lg:px-6 border-b border-amber-900/20 overflow-x-auto shrink-0">
        {TABS.map((tab) => {
          const href = basePath + tab.href;
          return (
            <Link
              key={tab.label}
              href={href}
              className="relative px-3 py-2.5 text-xs font-medium text-amber-400/50 hover:text-amber-200 transition-colors whitespace-nowrap"
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
