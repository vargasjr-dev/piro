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
    icon: GitHubIcon,
    connectHref: "/api/auth/connect/github",
    envCheck: "GITHUB_CLIENT_ID",
  },
  {
    key: "gmail" as const,
    name: "Gmail",
    description: "Emails and conversations",
    icon: GmailIcon,
    connectHref: "/api/auth/connect/gmail",
    envCheck: "GOOGLE_CLIENT_ID",
  },
  {
    key: "telegram" as const,
    name: "Telegram",
    description: "Messages with your assistant",
    icon: TelegramIcon,
    connectHref: "/knowledge/connect/telegram",
    envCheck: null, // uses Login Widget, no server env needed for connect
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
            icon={p.icon}
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

// ---- Inline SVG icons ----
function GitHubIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function GmailIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 6l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function TelegramIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.356 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}
