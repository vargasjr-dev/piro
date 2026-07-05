import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { dataSource } from "../../../../../data/schema";
import { r2ListPrefix } from "~/lib/r2";
import SourceDetail from "./SourceDetail";

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [source] = await db
    .select()
    .from(dataSource)
    .where(and(eq(dataSource.id, id), eq(dataSource.userId, session.user.id)))
    .limit(1);

  if (!source) notFound();

  // List files under the source's R2 prefix (relative paths)
  let files: string[] = [];
  if (source.r2Prefix) {
    try {
      // r2ListPrefix returns paths with userId stripped, prefixed by r2Prefix
      // e.g. ["sources/sorting-sequences/data/train.jsonl", ...]
      const raw = await r2ListPrefix(session.user.id, source.r2Prefix);
      // Strip the r2Prefix so we get ["data/train.jsonl", ...]
      files = raw
        .map((p) => p.slice(source.r2Prefix!.length))
        .filter((p) => p.length > 0 && p !== "script.py"); // script shown in its own tab
    } catch {
      files = [];
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link
          href="/sources"
          className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">{source.name}</h1>
          {source.description && (
            <p className="text-[11px] text-amber-400/40 mt-0.5 max-w-sm">{source.description}</p>
          )}
        </div>
      </div>

      <SourceDetail
        source={{
          id: source.id,
          name: source.name,
          description: source.description,
          type: source.type,
          r2Prefix: source.r2Prefix,
          scriptR2Key: source.scriptR2Key,
          sampleCount: source.sampleCount,
          generatedAt: source.generatedAt?.toISOString() ?? null,
          createdAt: source.createdAt.toISOString(),
          updatedAt: source.updatedAt.toISOString(),
          files,
        }}
      />
    </div>
  );
}
