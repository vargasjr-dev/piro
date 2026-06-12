/**
 * Central provider registry — single source of truth for all integrations.
 * Add new providers here; the drawer + page pick them up automatically.
 */

export type ProviderKey = "github" | "gmail" | "telegram" | "roam";
export type Category = "code" | "email" | "notes" | "messaging";

export interface ProviderConfig {
  key: ProviderKey;
  name: string;
  description: string;
  category: Category;
  connectHref: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  code: "Code",
  email: "Email",
  notes: "Notes",
  messaging: "Messaging",
};

export const PROVIDER_CATALOG: ProviderConfig[] = [
  {
    key: "github",
    name: "GitHub",
    description: "Commits, pull requests & code",
    category: "code",
    connectHref: "/api/auth/connect/github",
  },
  {
    key: "gmail",
    name: "Gmail",
    description: "Emails and conversations",
    category: "email",
    connectHref: "/api/auth/connect/gmail",
  },
  {
    key: "roam",
    name: "Roam Research",
    description: "Notes, pages & linked thought",
    category: "notes",
    connectHref: "/knowledge/connect/roam",
  },
  {
    key: "telegram",
    name: "Telegram",
    description: "Messages with your assistant",
    category: "messaging",
    connectHref: "/knowledge/connect/telegram",
  },
];

export const PROVIDER_BY_KEY = Object.fromEntries(
  PROVIDER_CATALOG.map((p) => [p.key, p]),
) as Record<ProviderKey, ProviderConfig>;

// ── Icons (JSX) ───────────────────────────────────────────────────────────────

export function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function GmailIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M2 6l10 7 10-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function RoamIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="4"  r="1.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="8"  r="1.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4"  cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4"  cy="8"  r="1.5" fill="currentColor" stroke="none" />
      <line x1="12" y1="9"  x2="12" y2="5.5" />
      <line x1="14.6" y1="10.5" x2="18.5" y2="9" />
      <line x1="14.6" y1="13.5" x2="18.5" y2="15" />
      <line x1="12" y1="15" x2="12" y2="18.5" />
      <line x1="9.4" y1="13.5" x2="5.5" y2="15" />
      <line x1="9.4" y1="10.5" x2="5.5" y2="9" />
    </svg>
  );
}

export function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.356 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export const PROVIDER_ICONS: Record<ProviderKey, React.FC<{ size?: number }>> = {
  github: GitHubIcon,
  gmail: GmailIcon,
  roam: RoamIcon,
  telegram: TelegramIcon,
};

export const PROVIDER_ICON_COLORS: Record<ProviderKey, string> = {
  github: "text-slate-300",
  gmail: "text-red-400",
  roam: "text-violet-400",
  telegram: "text-sky-400",
};
