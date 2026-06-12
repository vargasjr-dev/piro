"use client";

import { PROVIDER_ICONS, PROVIDER_ICON_COLORS } from "~/lib/integrations/catalog";
import type { ProviderKey } from "~/lib/integrations/catalog";

export interface IntegrationData {
  id: string;
  provider: string;
  providerUsername: string | null;
  status: string;
  syncMeta: string | null;
  lastSyncAt: Date | string | null;
  itemCount: number;
}

interface Props {
  name: string;
  integration: IntegrationData;
  onClick: () => void;
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

export default function IntegrationRow({ name, integration, onClick }: Props) {
  const key = integration.provider as ProviderKey;
  const Icon = PROVIDER_ICONS[key];
  const colorClass = PROVIDER_ICON_COLORS[key] ?? "text-amber-400/60";

  const isSyncing = integration.status === "syncing";
  const isError = integration.status === "error";

  const statusDot = isSyncing
    ? "bg-amber-400 animate-pulse"
    : isError
      ? "bg-red-500"
      : "bg-emerald-500";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-amber-900/15 transition-colors group text-left"
    >
      {/* Icon */}
      <span className={`shrink-0 ${colorClass}`}>
        {Icon ? <Icon size={16} /> : null}
      </span>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-amber-100/90">{name}</span>
          {integration.providerUsername && (
            <span className="text-xs text-amber-400/40 truncate">
              {integration.providerUsername}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {isSyncing ? (
            <span className="text-[10px] text-amber-400/50">Syncing…</span>
          ) : (
            <>
              {integration.itemCount > 0 && (
                <span className="text-[10px] text-amber-600/50">
                  {integration.itemCount.toLocaleString()} files
                </span>
              )}
              {integration.lastSyncAt && (
                <span className="text-[10px] text-amber-600/35">
                  {timeAgo(new Date(integration.lastSyncAt))}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status + chevron */}
      <div className="shrink-0 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-amber-600/30 group-hover:text-amber-600/60 transition-colors"
        >
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}
