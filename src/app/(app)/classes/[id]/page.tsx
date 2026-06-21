import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { modelClass } from "../../../../../data/schema";
import { r2Get } from "~/lib/r2";
import ClassDetailClient from "./ClassDetailClient";

interface ClassManifest {
  name: string;
  slug: string;
  description?: string;
  hyperparams?: Record<string, number | string | boolean>;
  parameterCount?: number;
  module?: string;
  modelClass?: string;
  configClass?: string;
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
  let source: string | null = null;

  if (cls.moduleR2Key) {
    const [manifestRaw, sourceRaw] = await Promise.all([
      r2Get(`${cls.moduleR2Key}/manifest.json`),
      r2Get(`${cls.moduleR2Key}/model.py`),
    ]);
    if (manifestRaw) {
      try { manifest = JSON.parse(manifestRaw) as ClassManifest; } catch { /* ignore */ }
    }
    source = sourceRaw;
  }

  return (
    <ClassDetailClient
      id={cls.id}
      name={manifest?.name ?? cls.name}
      slug={manifest?.slug ?? cls.slug}
      description={manifest?.description ?? cls.description ?? null}
      manifest={manifest}
      hasModule={!!cls.moduleR2Key}
      source={source}
    />
  );
}
