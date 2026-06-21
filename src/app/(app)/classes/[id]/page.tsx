import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { modelClass } from "../../../../../data/schema";
import { r2Get } from "~/lib/r2";
import ClassDetailClient, { type ClassManifest } from "./ClassDetailClient";

// The serialize endpoint — deterministic from Modal app + function name.
// Set MODAL_SERIALIZE_ENDPOINT in Vercel env vars to override.
// Must also set MODAL_WEBHOOK_SECRET to match the Modal piro-secrets value.
const SERIALIZE_ENDPOINT =
  process.env.MODAL_SERIALIZE_ENDPOINT ??
  "https://dvargasfuertes--piro-serialize.modal.run";

type ManifestResult =
  | { manifest: ClassManifest; error: null }
  | { manifest: null; error: string };

async function fetchManifest(classId: string): Promise<ManifestResult> {
  const secret = process.env.MODAL_WEBHOOK_SECRET ?? "";
  try {
    const res = await fetch(
      `${SERIALIZE_ENDPOINT}?class_id=${encodeURIComponent(classId)}`,
      {
        headers: { "X-Piro-Secret": secret },
        // Don't cache at the Next.js layer — Modal's Dict cache handles it
        cache: "no-store",
      },
    );
    if (!res.ok) {
      let detail = `Serialize endpoint returned ${res.status}`;
      try {
        const body = await res.json() as { detail?: string };
        if (body.detail) detail = `${detail}: ${body.detail}`;
      } catch { /* ignore parse error */ }
      console.error(`[piro] ${detail} for class ${classId}`);
      return { manifest: null, error: detail };
    }
    return { manifest: await res.json() as ClassManifest, error: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[piro] serialize endpoint unreachable for class ${classId}:`, err);
    return { manifest: null, error: `Serialize endpoint unreachable: ${detail}` };
  }
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [cls] = await db
    .select()
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, session.user.id)))
    .limit(1);

  if (!cls) notFound();

  let manifest: ClassManifest | null = null;
  let manifestError: string | null = null;
  let source: string | null = null;

  if (cls.moduleR2Key) {
    // Fetch manifest from Modal serialize endpoint and source from R2 in parallel
    const [manifestResult, r2Source] = await Promise.all([
      fetchManifest(cls.id),
      r2Get(`${cls.moduleR2Key}/model.py`),
    ]);
    manifest = manifestResult.manifest;
    manifestError = manifestResult.error;
    source = r2Source;
  }

  return (
    <ClassDetailClient
      id={cls.id}
      name={manifest?.name ?? cls.name}
      slug={manifest?.slug ?? cls.slug}
      description={manifest?.description ?? cls.description ?? null}
      manifest={manifest}
      manifestError={manifestError}
      hasModule={!!cls.moduleR2Key}
      source={source}
    />
  );
}
