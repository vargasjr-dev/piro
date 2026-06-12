"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  PROVIDER_ICONS,
  PROVIDER_ICON_COLORS,
} from "~/lib/integrations/catalog";
import type { ProviderKey } from "~/lib/integrations/catalog";
import type { IntegrationData } from "./IntegrationRow";

interface SyncMeta {
  step: string;
  current?: string;
  done: number;
  total: number;
  error?: string;
  reconnect?: boolean;
}

interface Props {
  providerKey: ProviderKey;
  name: string;
  description: string;
  connectHref: string;
  integration: IntegrationData;
  onAction?: () => void;
  onBack: () => void;
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  return (
    <div className="w-full h-1 bg-amber-900/30 rounded-full overflow-hidden">
      {pct !== null ? (
        <div
          className="h-full bg-orange-500/60 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div className="h-full bg-orange-500/40 rounded-full animate-pulse w-1/3" />
      )}
    </div>
  );
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function IntegrationDetail({
  providerKey,
  name,
  description,
  connectHref,
  integration,
  onAction,
  onBack,
}: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveMeta, setLiveMeta] = useState<SyncMeta | null>(null);
  const [liveItemCount, setLiveItemCount] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const Icon = PROVIDER_ICONS[providerKey];
  const colorClass = PROVIDER_ICON_COLORS[providerKey] ?? "text-amber-400/60";

  const effectiveStatus = liveStatus ?? integration.status;
  const isSyncing = effectiveStatus === "syncing";
  const itemCount = liveItemCount ?? integration.itemCount ?? 0;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (integrationId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/integrations/${integrationId}/status`);
          if (!res.ok) return;
          const data = (await res.json()) as {
            status: string;
            syncMeta: SyncMeta | null;
            itemCount: number;
          };
          setLiveStatus(data.status);
          setLiveMeta(data.syncMeta);
          setLiveItemCount(data.itemCount);

          if (data.status !== "syncing") {
            stopPolling();
            setSyncing(false);
            if (data.status === "error" && data.syncMeta?.error) {
              setSyncError(data.syncMeta.error);
              setNeedsReconnect(data.syncMeta.reconnect ?? false);
            }
            router.refresh();
            onAction?.();
          }
        } catch {
          // network blip — keep polling
        }
      }, 2500);
    },
    [stopPolling, router, onAction],
  );

  // Auto-resume polling if mounted while already syncing
  useEffect(() => {
    if (integration.status === "syncing") {
      setSyncing(true);
      startPolling(integration.id);
    }
    return stopPolling;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setNeedsReconnect(false);
    setLiveStatus("syncing");
    setLiveMeta({ step: "Starting…", done: 0, total: 0 });

    try {
      const res = await fetch(`/api/integrations/${integration.id}/sync`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as {
          error?: string;
          reconnect?: boolean;
        };
        setSyncError(data.error ?? "Sync failed");
        setNeedsReconnect(data.reconnect ?? false);
        setLiveStatus("error");
        setSyncing(false);
        return;
      }
      startPolling(integration.id);
    } catch {
      setSyncError("Network error — try again");
      setLiveStatus("error");
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }
    stopPolling();
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await fetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
      router.refresh();
      onAction?.();
      onBack();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-900/20 shrink-0">
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-900/30 text-amber-400/50 hover:text-amber-200 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className={`shrink-0 ${colorClass}`}>
          {Icon ? <Icon size={18} /> : null}
        </span>
        <div>
          <h3 className="text-sm font-bold text-amber-50 leading-none">
            {name}
          </h3>
          <p className="text-xs text-amber-400/40 mt-0.5">{description}</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Meta row */}
        <div className="space-y-1.5">
          {integration.providerUsername && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-amber-600/40 w-16 shrink-0">Account</span>
              <span className="text-amber-200/70 font-medium">
                {integration.providerUsername}
              </span>
            </div>
          )}
          {itemCount > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-amber-600/40 w-16 shrink-0">Files</span>
              <span className="text-amber-200/70">
                {itemCount.toLocaleString()}
              </span>
            </div>
          )}
          {integration.lastSyncAt && !isSyncing && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-amber-600/40 w-16 shrink-0">Synced</span>
              <span className="text-amber-200/70">
                {timeAgo(new Date(integration.lastSyncAt))}
              </span>
            </div>
          )}
        </div>

        {/* Progress */}
        {isSyncing && (
          <div className="space-y-2">
            <div className="text-xs text-amber-400/60 truncate">
              {liveMeta?.current ?? liveMeta?.step ?? "Syncing…"}
            </div>
            {liveMeta && (
              <ProgressBar done={liveMeta.done} total={liveMeta.total} />
            )}
            {liveMeta && liveMeta.total > 0 && (
              <div className="text-[10px] text-amber-600/40 text-right">
                {liveMeta.done} / {liveMeta.total}
              </div>
            )}
          </div>
        )}

        {/* Sync error */}
        {syncError && !isSyncing && (
          <div className="bg-red-950/40 border border-red-800/30 rounded-xl px-4 py-3 text-xs text-red-400 space-y-2">
            <p>
              <span className="font-semibold">Sync failed:</span>{" "}
              {needsReconnect
                ? "Your session expired or was revoked."
                : syncError}
            </p>
            {needsReconnect && (
              <a
                href={connectHref}
                className="inline-block px-3 py-1.5 rounded-lg bg-orange-600/80 hover:bg-orange-500 text-white text-xs font-semibold transition-colors"
              >
                Reconnect {name} →
              </a>
            )}
          </div>
        )}

        {/* Confirm disconnect */}
        {confirmDisconnect && (
          <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-3 space-y-3">
            <p className="text-xs text-amber-300/70">
              Remove {name} and delete all synced files?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex-1 px-3 py-2 rounded-lg bg-red-900/40 border border-red-800/30 text-red-400 text-xs font-medium hover:bg-red-900/60 disabled:opacity-40 transition"
              >
                {disconnecting ? "Removing…" : "Yes, remove"}
              </button>
              <button
                onClick={() => setConfirmDisconnect(false)}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/20 text-amber-400/60 text-xs font-medium hover:bg-amber-900/40 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!confirmDisconnect && (
        <div className="px-5 pb-5 pt-2 shrink-0 flex gap-2 border-t border-amber-900/20">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-900/30 border border-amber-800/30 text-amber-300 text-sm font-medium hover:bg-amber-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {isSyncing ? "Syncing…" : "Sync now"}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting || isSyncing}
            className="px-4 py-2.5 rounded-xl bg-red-900/20 border border-red-800/20 text-red-400/70 text-sm font-medium hover:bg-red-900/40 disabled:opacity-40 transition"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
