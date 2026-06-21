import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { apiKey } from "../../../../data/schema";
import KeysClient from "./KeysClient";

export default async function KeysPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const keys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, session.user.id))
    .orderBy(apiKey.createdAt);

  const serialized = keys.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">API Keys</h1>
          <p className="text-[11px] text-amber-400/40 mt-0.5">
            Keys authenticate as you. Treat them like passwords.
          </p>
        </div>
      </div>

      <KeysClient initialKeys={serialized} />
    </div>
  );
}
