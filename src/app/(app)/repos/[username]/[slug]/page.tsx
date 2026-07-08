import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import {
  repository,
  dataset,
  trainingRun,
  user,
} from "../../../../../../data/schema";

interface ComponentItem {
  id: string;
  name: string;
  href: string;
  subtitle: string;
  badge?: string;
}

function Section({
  title,
  items,
  emptyText,
  createHint,
}: {
  title: string;
  items: ComponentItem[];
  emptyText: string;
  createHint?: string;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-amber-300/60 uppercase tracking-wider mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-amber-700/30 italic">
          {emptyText}
          {createHint && <span className="not-italic"> — <code className="font-mono text-amber-600/30">{createHint}</code></span>}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-900/15 bg-amber-900/5 hover:bg-amber-900/10 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-amber-200/80">{item.name}</span>
                <span className="text-[10px] text-amber-700/30 ml-2">{item.subtitle}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] text-amber-600/40 italic">{item.badge}</span>
              )}
              <svg className="w-3 h-3 text-amber-800/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function RepoPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username: ownerHandle, slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  // Resolve username → user, then find repo by (userId, slug)
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

  // Fetch datasets and training runs belonging to this repo
  const [datasets, runs] = await Promise.all([
    db.select().from(dataset).where(eq(dataset.repositoryId, repo.id)).orderBy(desc(dataset.createdAt)),
    db.select().from(trainingRun).where(eq(trainingRun.repositoryId, repo.id)).orderBy(desc(trainingRun.queuedAt)).limit(10),
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link href="/repos" className="text-amber-600/40 hover:text-amber-400/70 transition-colors">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600/40" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L12 3l9 4.5M3 7.5L12 12m-9-4.5v9L12 21m0-9l9-4.5m-9 4.5v9m9-13.5v9L12 21" />
            </svg>
            <h1 className="text-amber-100 font-bold text-sm tracking-tight">{repo.name}</h1>
          </div>
          {repo.description && (
            <p className="text-[11px] text-amber-400/40 mt-0.5 max-w-md">{repo.description}</p>
          )}
        </div>
      </div>

      {/* Components */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 max-w-2xl">
        <Section
          title="Datasets"
          items={datasets.map((d) => ({
            id: d.id,
            name: d.name,
            href: `/repos/${ownerHandle}/${repo.slug}`,
            subtitle: d.sampleCount ? `${d.sampleCount.toLocaleString()} samples` : d.sourcePath,
            badge: d.generatedAt ? undefined : "not generated",
          }))}
          emptyText="No datasets generated yet"
          createHint="piro sources generate"
        />

        <Section
          title="Training Runs"
          items={runs.map((r) => ({
            id: r.id,
            name: r.modelName ?? r.architecturePath,
            href: `/training/${r.id}`,
            subtitle: `${r.architecturePath} · ${r.epochs} epochs`,
            badge: r.status,
          }))}
          emptyText="No training runs yet"
        />
      </div>
    </div>
  );
}
