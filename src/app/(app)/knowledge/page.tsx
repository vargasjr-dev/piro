import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq, desc } from "drizzle-orm";
import { db } from "../../../../data/db";
import { integration, knowledgeItem } from "../../../../data/schema";
import IntegrationCard from "./IntegrationCard";
import KnowledgeItems from "./KnowledgeItems";

const PROVIDERS = [
  {
    key: "github" as const,
    name: "GitHub",
    description: "Commits, pull requests & code",
    connectHref: "/api/auth/connect/github",
  },
  {
    key: "gmail" as const,
    name: "Gmail",
    description: "Emails and conversations",
    connectHref: "/api/auth/connect/gmail",
  },
  {
    key: "telegram" as const,
    name: "Telegram",
    description: "Messages with your assistant",
    connectHref: "/knowledge/connect/telegram",
  },
];

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) return null;

  const { error } = await searchParams;

  const integrations = await db
    .select()
    .from(integration)
    .where(eq(integration.userId, session.user.id));

  const intByProvider = Object.fromEntries(integrations.map((i) => [i.provider, i]));

  // Recent knowledge items (last 50 across all integrations)
  const items =
    integrations.length > 0
      ? await db
          .select()
          .from(knowledgeItem)
          .where(eq(knowledgeItem.userId, session.user.id))
          .orderBy(desc(knowledgeItem.createdAt))
          .limit(50)
      : [];

  const totalItems = integrations.reduce((s, i) => s + i.itemCount, 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-black text-amber-50 mb-2">Knowledge Base</h1>
        <p className="text-amber-400/60">
          Connect your accounts. Piro pulls the data that defines you.
        </p>
        {error && (
          <div className="mt-4 bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 text-sm text-red-400">
            {errorMessage(error)}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {totalItems > 0 && (
        <div className="flex items-center gap-6 mb-8 px-1">
          <div>
            <span className="text-2xl font-black text-amber-50">{totalItems.toLocaleString()}</span>
            <span className="text-sm text-amber-400/50 ml-2">total items</span>
          </div>
          <div className="h-4 w-px bg-amber-900/40" />
          <div>
            <span className="text-2xl font-black text-amber-50">{integrations.length}</span>
            <span className="text-sm text-amber-400/50 ml-2">
              {integrations.length === 1 ? "source" : "sources"} connected
            </span>
          </div>
        </div>
      )}

      {/* Integration cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {PROVIDERS.map((p) => (
          <IntegrationCard
            key={p.key}
            provider={p.key}
            name={p.name}
            description={p.description}
            connectHref={p.connectHref}
            integration={intByProvider[p.key] ?? null}
          />
        ))}
      </div>

      {/* Knowledge items */}
      <KnowledgeItems items={items} totalItems={totalItems} />
    </div>
  );
}

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    github_not_configured: "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
    gmail_not_configured: "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    telegram_not_configured: "Telegram bot not configured.",
    github_oauth_failed: "GitHub authorization failed. Please try again.",
    gmail_oauth_failed: "Gmail authorization failed. Please try again.",
    github_token_failed: "Could not get GitHub access token. Check OAuth app settings.",
    gmail_token_failed: "Could not get Gmail access token. Check OAuth app settings.",
    telegram_invalid_hash: "Telegram auth verification failed.",
    telegram_expired: "Telegram auth expired. Please try again.",
  };
  return map[code] ?? `OAuth error: ${code}`;
}


