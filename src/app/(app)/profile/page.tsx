import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { account, integration, user } from "../../../../data/schema";
import { eq, and } from "drizzle-orm";
import { isAdmin } from "~/lib/admin";
import { getSubscription, isActive } from "~/lib/billing";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) redirect("/login");

  // Check for linked GitHub auth account (better-auth social login)
  const [githubAccount] = await db
    .select({ providerId: account.providerId, accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, session.user.id), eq(account.providerId, "github")))
    .limit(1);

  // Fetch username from user table (not in better-auth session type)
  const [userRow] = await db
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  // Check for GitHub data integration (repo sync)
  const [githubIntegration] = await db
    .select({
      id: integration.id,
      providerUsername: integration.providerUsername,
      status: integration.status,
      itemCount: integration.itemCount,
    })
    .from(integration)
    .where(and(eq(integration.userId, session.user.id), eq(integration.provider, "github")))
    .limit(1);

  const sub = await getSubscription(session.user.id);
  const admin = isAdmin(session);

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-amber-50 mb-1">Profile</h1>
      <p className="text-amber-400/40 text-sm mb-8">Manage your account and connections.</p>

      {/* User info */}
      <section className="bg-[#1a1208]/80 border border-amber-900/30 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-amber-300/70 uppercase tracking-wide mb-4">Account</h2>
        <dl className="space-y-3">
          <div className="flex justify-between items-center">
            <dt className="text-amber-400/50 text-sm">Name</dt>
            <dd className="text-amber-100 text-sm font-medium">{session.user.name}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-amber-400/50 text-sm">Email</dt>
            <dd className="text-amber-100 text-sm font-medium">{session.user.email}</dd>
          </div>
          {userRow?.username && (
            <div className="flex justify-between items-center">
              <dt className="text-amber-400/50 text-sm">Username</dt>
              <dd className="text-amber-100 text-sm font-medium">@{userRow.username}</dd>
            </div>
          )}
          <div className="flex justify-between items-center">
            <dt className="text-amber-400/50 text-sm">Plan</dt>
            <dd className="flex items-center gap-2">
              {admin ? (
                <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-medium">Admin</span>
              ) : isActive(sub) ? (
                <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-medium">Pro</span>
              ) : (
                <span className="text-xs bg-amber-900/30 text-amber-400/50 px-2 py-0.5 rounded-full font-medium">Free</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* GitHub connection */}
      <ProfileClient
        githubLinked={!!githubAccount}
        githubIntegration={
          githubIntegration
            ? {
                username: githubIntegration.providerUsername,
                status: githubIntegration.status,
                itemCount: githubIntegration.itemCount,
              }
            : null
        }
      />
    </div>
  );
}
