"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Integration {
  id: string;
  provider: string;
  providerUsername: string | null;
  status: string;
  lastSyncAt: Date | null;
  itemCount: number;
}

interface Props {
  provider: "github" | "gmail" | "telegram";
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  connectHref: string;
  integration: Integration | null;
}

const providerColors = {
  github: "text-slate-300",
  gmail: "text-red-400",
  telegram: "text-sky-400",
};

export default function IntegrationCard({
  provider,
  name,
  description,
  icon: Icon,
  connectHref,
  integration,
}: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isConnected = !!integration;
  const colorClass = providerColors[provider];

  async function handleSync() {
    if (!integration) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/integrations/${integration.id}/sync`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        alert(data.error ?? "Sync failed");
      }
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!integration) return;
    if (!confirm(`Disconnect ${name}? All synced items will be deleted.`)) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
      router.refresh();
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

      {/* Actions */}
      <div className="mt-auto pt-1">
        {!isConnected ? (
          <a
            href={connectHref}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white text-sm font-semibold hover:from-orange-500 hover:to-amber-400 transition-all"
          >
            Connect →
          </a>
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
              {disconnecting ? "…" : "Disconnect"}
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
