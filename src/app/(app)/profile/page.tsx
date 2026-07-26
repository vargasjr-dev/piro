import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { user, apiKey } from "../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { getSubscription, isActive } from "~/lib/billing";
import KeysClient from "../keys/KeysClient";
import SignOutButton from "./SignOutButton";

export default async function ProfilePage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) redirect("/login");

  // Fetch username from user table (not in better-auth session type)
  const [userRow] = await db
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  const sub = await getSubscription(session.user.id);
  // Fetch API keys
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

  const serializedKeys = keys.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  }));

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-amber-50 mb-1">Profile</h1>
      <p className="text-amber-400/40 text-sm mb-8">
        Manage your account and API keys.
      </p>

      {/* User info */}
      <section className="bg-[#1a1208]/80 border border-amber-900/30 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-amber-300/70 uppercase tracking-wide mb-4">
          Account
        </h2>
        <dl className="space-y-3">
          <div className="flex justify-between items-center">
            <dt className="text-amber-400/50 text-sm">Name</dt>
            <dd className="text-amber-100 text-sm font-medium">
              {session.user.name}
            </dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-amber-400/50 text-sm">Email</dt>
            <dd className="text-amber-100 text-sm font-medium">
              {session.user.email}
            </dd>
          </div>
          {userRow?.username && (
            <div className="flex justify-between items-center">
              <dt className="text-amber-400/50 text-sm">Username</dt>
              <dd className="text-amber-100 text-sm font-medium">
                @{userRow.username}
              </dd>
            </div>
          )}
          <div className="flex justify-between items-center">
            <dt className="text-amber-400/50 text-sm">Plan</dt>
            <dd className="flex items-center gap-2">
              {isActive(sub) ? (
                <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-medium">
                  Pro
                </span>
              ) : (
                <span className="text-xs bg-amber-900/30 text-amber-400/50 px-2 py-0.5 rounded-full font-medium">
                  Free
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* API Keys */}
      <div id="api-keys" className="mt-6">
        <h2 className="text-sm font-semibold text-amber-300/70 uppercase tracking-wide mb-4">
          API Keys
        </h2>
        <p className="text-amber-400/40 text-xs mb-4">
          Keys authenticate as you. Treat them like passwords.
        </p>
        <KeysClient initialKeys={serializedKeys} />
      </div>

      {/* Sign out */}
      <div className="mt-8 pt-6 border-t border-amber-900/20">
        <SignOutButton className="px-4 py-2 text-sm text-amber-400/60 hover:text-amber-200 transition border border-amber-900/30 rounded-lg hover:border-amber-900/50 disabled:opacity-50" />
      </div>
    </div>
  );
}
