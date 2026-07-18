import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { repository, user } from "../../../../../../data/schema";

const TABS = [
  { label: "Overview", href: "" },
  { label: "Sources", href: "/sources" },
  { label: "Architectures", href: "/architectures" },
  { label: "Benchmarks", href: "/benchmarks" },
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
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
