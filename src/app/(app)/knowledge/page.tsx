import { headers, cookies } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq } from "drizzle-orm";
import { db } from "../../../../data/db";
import { integration } from "../../../../data/schema";
import FileExplorer from "./FileExplorer";
import SourcesDrawer from "./SourcesDrawer";
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

  // Flash errors come from OAuth callback routes (short-lived cookie)
  const flashError = cookieStore.get(FLASH_COOKIE)?.value ?? null;

  const integrations = await db
    .select()
    .from(integration)
    .where(eq(integration.userId, session.user.id));

  const intByProvider = Object.fromEntries(
    integrations.map((i) => [i.provider, i]),
  );

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">Knowledge Base</h1>
          <p className="text-xs text-amber-400/40 mt-0.5">Your personal workspace</p>
        </div>
        <SourcesDrawer
          providers={PROVIDERS}
          intByProvider={intByProvider}
          integrationCount={integrations.length}
          error={flashError}
        />
      </div>

      {/* Workspace — fills remaining height */}
      <div className="flex-1 px-6 py-5 min-h-0">
        <FileExplorer integrationCount={integrations.length} />
      </div>
    </div>
  );
}
