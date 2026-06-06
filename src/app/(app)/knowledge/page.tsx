import { headers, cookies } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq } from "drizzle-orm";
import { db } from "../../../../data/db";
import { integration } from "../../../../data/schema";
import IntegrationCard from "./IntegrationCard";
import FileExplorer from "./FileExplorer";
import { FLASH_COOKIE } from "~/lib/flash";

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

export default async function KnowledgePage() {
  const [headersList, cookieStore] = await Promise.all([headers(), cookies()]);
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) return null;

  // Flash errors (OAuth failures from callback routes — short-lived cookie)
  const flashError = cookieStore.get(FLASH_COOKIE)?.value ?? null;

  // Only surface errors from actual OAuth attempts (flash cookie set by callback routes)
  const error = flashError;

  const integrations = await db
    .select()
    .from(integration)
    .where(eq(integration.userId, session.user.id));

  const intByProvider = Object.fromEntries(
    integrations.map((i) => [i.provider, i]),
  );

  const totalItems = integrations.reduce((s, i) => s + i.itemCount, 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="text-amber-400/60">
          Connect your accounts. Piro pulls the data that defines you.
        </p>
        {error && (
          <div className="mt-4 bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 text-sm text-red-400">
            {errorMessage(error)}
          </div>
        )}
      </div>

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

      {/* File explorer */}
      <FileExplorer integrationCount={integrations.length} />
    </div>
  );
}

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    github_not_configured:
      "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
    gmail_not_configured:
      "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    telegram_not_configured: "Telegram bot not configured.",
    github_oauth_failed: "GitHub authorization failed. Please try again.",
    gmail_oauth_failed: "Gmail authorization failed. Please try again.",
    github_token_failed:
      "Could not get GitHub access token. Check OAuth app settings.",
    gmail_token_failed:
      "Could not get Gmail access token. Check OAuth app settings.",
    telegram_invalid_hash: "Telegram auth verification failed.",
    telegram_expired: "Telegram auth expired. Please try again.",
  };
  return map[code] ?? `OAuth error: ${code}`;
}
