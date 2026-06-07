"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Integration {
  id: string;
  provider: string;
  providerUsername: string | null;
  status: string;
  lastSyncAt: Date | string | null;
  itemCount: number;
}

interface Props {
  provider: "github" | "gmail" | "telegram";
  name: string;
  description: string;
  connectHref: string;
  integration: Integration | null;
  onAction?: () => void;
}

// Icons live here — client-only, not serialized across RSC boundary
function GitHubIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function GmailIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 6l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function TelegramIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.356 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

const ICONS = {
  github: GitHubIcon,
  gmail: GmailIcon,
  telegram: TelegramIcon,
};

const ICON_COLORS = {
  github: "text-slate-300",
  gmail: "text-red-400",
  telegram: "text-sky-400",
};

export default function IntegrationCard({
  provider,
  name,
  description,
  connectHref,
  integration,
  onAction,
}: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const isConnected = !!integration;
  const Icon = ICONS[provider];
  const colorClass = ICON_COLORS[provider];

  async function handleSync() {
    if (!integration) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/integrations/${integration.id}/sync`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setSyncError(data.error ?? "Sync failed");
      }
      router.refresh();
      onAction?.();
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!integration) return;
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await fetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
      router.refresh();
      onAction?.();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="bg-[#120e08] border border-amber-900/30 rounded-2xl p-6 flex flex-col gap-5 hover:border-amber-800/50 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${colorClass}`}>
          <Icon size={22} />
        </div>
        <div>
          <h3 className="font-bold text-amber-50 leading-none mb-1">{name}</h3>
          <p className="text-xs text-amber-400/50">{description}</p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            !isConnected
              ? "bg-amber-900/60"
              : integration.status === "syncing"
                ? "bg-amber-400 animate-pulse"
                : integration.status === "error"
                  ? "bg-red-500"
                  : "bg-emerald-500"
          }`}
        />
        <span className="text-xs text-amber-400/60">
          {!isConnected ? (
            "Not connected"
          ) : integration.status === "syncing" ? (
            "Syncing…"
          ) : (
            <>
              <span className="text-amber-200/80">{integration.providerUsername}</span>
              {integration.itemCount > 0 && (
                <> · {integration.itemCount.toLocaleString()} items</>
              )}
              {integration.lastSyncAt && (
                <> · {timeAgo(new Date(integration.lastSyncAt))}</>
              )}
            </>
          )}
        </span>
      </div>

      {/* Sync error */}
      {syncError && (
        <div className="bg-red-950/40 border border-red-800/30 rounded-xl px-3 py-2.5 text-xs text-red-400 leading-relaxed">
          <span className="font-semibold">Sync failed:</span> {syncError}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto pt-1 flex flex-col gap-2">
        {!isConnected ? (
          <a
            href={connectHref}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white text-sm font-semibold hover:from-orange-500 hover:to-amber-400 transition-all"
          >
            Connect →
          </a>
        ) : confirmDisconnect ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-amber-400/60 text-center">Remove {name} and all synced files?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex-1 px-3 py-2 rounded-xl bg-red-900/40 border border-red-800/30 text-red-400 text-sm font-medium hover:bg-red-900/60 disabled:opacity-40 transition"
              >
                {disconnecting ? "Removing…" : "Yes, remove"}
              </button>
              <button
                onClick={() => setConfirmDisconnect(false)}
                className="flex-1 px-3 py-2 rounded-xl bg-amber-900/20 border border-amber-800/20 text-amber-400/60 text-sm font-medium hover:bg-amber-900/40 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || integration.status === "syncing"}
              className="flex-1 px-3 py-2 rounded-xl bg-amber-900/30 border border-amber-800/30 text-amber-300 text-sm font-medium hover:bg-amber-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-2 rounded-xl bg-red-900/20 border border-red-800/20 text-red-400/70 text-sm font-medium hover:bg-red-900/40 disabled:opacity-40 transition"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
