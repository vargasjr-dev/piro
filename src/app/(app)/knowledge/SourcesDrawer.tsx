"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import IntegrationCard from "./IntegrationCard";

interface Integration {
  id: string;
  provider: string;
  providerUsername: string | null;
  status: string;
  syncMeta: string | null;
  lastSyncAt: Date | string | null;
  itemCount: number;
}

interface Provider {
  key: "github" | "gmail" | "telegram";
  name: string;
  description: string;
  connectHref: string;
}

interface Props {
  providers: Provider[];
  intByProvider: Record<string, Integration>;
  integrationCount: number;
  error: string | null;
}

function SourceDot({ status, connected }: { status?: string; connected: boolean }) {
  if (!connected) return <span className="w-1.5 h-1.5 rounded-full bg-amber-900/50" />;
  if (status === "error") return <span className="w-1.5 h-1.5 rounded-full bg-red-500" />;
  if (status === "syncing") return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />;
}

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    github_oauth_failed: "GitHub authorization failed. Please try again.",
    gmail_oauth_failed: "Gmail authorization failed. Please try again.",
    github_token_failed: "Could not get GitHub access token. Check OAuth app settings.",
    gmail_token_failed: "Could not get Gmail access token. Check OAuth app settings.",
    telegram_invalid_hash: "Telegram auth verification failed.",
    telegram_expired: "Telegram auth expired. Please try again.",
  };
  return map[code] ?? `OAuth error: ${code}`;
}

export default function SourcesDrawer({ providers, intByProvider, integrationCount, error }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Refresh after any action inside the drawer
  function onAction() {
    router.refresh();
  }

  return (
    <>
      {/* Sources trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-900/30 bg-amber-900/10 hover:bg-amber-900/20 transition-colors group"
      >
        <div className="flex items-center gap-1">
          {providers.map((p) => (
            <SourceDot
              key={p.key}
              connected={!!intByProvider[p.key]}
              status={intByProvider[p.key]?.status}
            />
          ))}
        </div>
        <span className="text-xs text-amber-400/60 group-hover:text-amber-300/80 transition-colors">
          {integrationCount === 0 ? "Connect sources" : `${integrationCount} source${integrationCount !== 1 ? "s" : ""}`}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600/40">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 z-50 bg-[#0d0a08] border-l border-amber-900/25 flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-900/20 shrink-0">
          <div>
            <h2 className="font-bold text-amber-50 text-sm">Data Sources</h2>
            <p className="text-xs text-amber-400/40 mt-0.5">Connect accounts to fill your workspace</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-900/30 text-amber-400/50 hover:text-amber-200 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Flash error */}
        {error && (
          <div className="mx-5 mt-4 bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 text-xs text-red-400 shrink-0">
            {errorMessage(error)}
          </div>
        )}

        {/* Integration cards */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {providers.map((p) => (
            <IntegrationCard
              key={p.key}
              provider={p.key}
              name={p.name}
              description={p.description}
              connectHref={p.connectHref}
              integration={intByProvider[p.key] ?? null}
              onAction={onAction}
            />
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-4 border-t border-amber-900/20 shrink-0">
          <p className="text-xs text-amber-600/30">
            After syncing, files appear in your workspace automatically.
          </p>
        </div>
      </div>
    </>
  );
}
