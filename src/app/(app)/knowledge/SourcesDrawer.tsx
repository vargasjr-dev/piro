"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  PROVIDER_CATALOG,
  PROVIDER_ICONS,
  PROVIDER_ICON_COLORS,
  CATEGORY_LABELS,
} from "~/lib/integrations/catalog";
import type { ProviderKey, Category } from "~/lib/integrations/catalog";
import IntegrationRow from "./IntegrationRow";
import IntegrationDetail from "./IntegrationDetail";
import type { IntegrationData } from "./IntegrationRow";

interface Props {
  intByProvider: Record<string, IntegrationData>;
  integrationCount: number;
  error: string | null;
}

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    github_oauth_failed: "GitHub authorization failed. Please try again.",
    gmail_oauth_failed: "Gmail authorization failed. Please try again.",
    github_token_failed: "Could not get GitHub access token.",
    gmail_token_failed: "Could not get Gmail access token.",
    telegram_invalid_hash: "Telegram auth verification failed.",
    telegram_expired: "Telegram auth expired. Please try again.",
  };
  return map[code] ?? `OAuth error: ${code}`;
}

function StatusDot({
  status,
  connected,
}: {
  status?: string;
  connected: boolean;
}) {
  if (!connected)
    return <span className="w-1.5 h-1.5 rounded-full bg-amber-900/50" />;
  if (status === "error")
    return <span className="w-1.5 h-1.5 rounded-full bg-red-500" />;
  if (status === "syncing")
    return (
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
    );
  return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />;
}

export default function SourcesDrawer({
  intByProvider,
  integrationCount,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<ProviderKey | null>(null);
  const router = useRouter();

  function onAction() {
    router.refresh();
  }

  const q = search.toLowerCase().trim();

  // Split catalog into connected / available, both filtered by search
  const connected = useMemo(
    () =>
      PROVIDER_CATALOG.filter(
        (p) => intByProvider[p.key] && (!q || p.name.toLowerCase().includes(q)),
      ),
    [intByProvider, q],
  );

  const available = useMemo(
    () =>
      PROVIDER_CATALOG.filter(
        (p) => !intByProvider[p.key] && (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
      ),
    [intByProvider, q],
  );

  // Group available by category
  const availableByCategory = useMemo(() => {
    const map = new Map<Category, typeof available>();
    for (const p of available) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, [available]);

  const selectedProvider = selectedKey
    ? PROVIDER_CATALOG.find((p) => p.key === selectedKey)
    : null;
  const selectedIntegration = selectedKey ? intByProvider[selectedKey] : null;

  function handleClose() {
    setOpen(false);
    setSearch("");
    setSelectedKey(null);
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-900/30 bg-amber-900/10 hover:bg-amber-900/20 transition-colors group"
      >
        <div className="flex items-center gap-1">
          {PROVIDER_CATALOG.map((p) => (
            <StatusDot
              key={p.key}
              connected={!!intByProvider[p.key]}
              status={intByProvider[p.key]?.status}
            />
          ))}
        </div>
        <span className="text-xs text-amber-400/60 group-hover:text-amber-300/80 transition-colors">
          {integrationCount === 0
            ? "Connect sources"
            : `${integrationCount} source${integrationCount !== 1 ? "s" : ""}`}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-amber-600/40"
        >
          <path
            d="M9 18l6-6-6-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={handleClose}
        />
      )}

      {/* Drawer shell */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 z-50 bg-[#0d0a08] border-l border-amber-900/25 flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-900/20 shrink-0">
          <div>
            <h2 className="font-bold text-amber-50 text-sm">Data Sources</h2>
            <p className="text-xs text-amber-400/40 mt-0.5">
              Connect accounts to fill your workspace
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-900/30 text-amber-400/50 hover:text-amber-200 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Sliding panels */}
        <div className="relative flex-1 overflow-hidden">
          {/* ── LIST PANEL ────────────────────────────────────────── */}
          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-250 ease-out ${
              selectedKey ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            {/* Flash error */}
            {error && (
              <div className="mx-5 mt-4 bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 text-xs text-red-400 shrink-0">
                {errorMessage(error)}
              </div>
            )}

            {/* Search */}
            <div className="px-5 pt-4 pb-2 shrink-0">
              <div className="relative">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600/40"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path
                    d="m21 21-4.35-4.35"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search integrations…"
                  className="w-full bg-amber-900/10 border border-amber-900/25 rounded-lg pl-8 pr-3 py-2 text-xs text-amber-200/80 placeholder-amber-600/35 focus:outline-none focus:border-orange-600/40 transition-colors"
                />
              </div>
            </div>

            {/* Scrollable list body */}
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {/* Connected */}
              {connected.length > 0 && (
                <section className="mt-3">
                  <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-600/40">
                    Connected
                  </p>
                  <div className="space-y-0.5">
                    {connected.map((p) => (
                      <IntegrationRow
                        key={p.key}
                        name={p.name}
                        integration={intByProvider[p.key]}
                        onClick={() => setSelectedKey(p.key)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Available — grouped by category */}
              {availableByCategory.size > 0 && (
                <section className="mt-4">
                  <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-600/40">
                    {connected.length > 0 ? "Available" : "Connect a source"}
                  </p>
                  <div className="space-y-4">
                    {Array.from(availableByCategory.entries()).map(
                      ([cat, providers]) => (
                        <div key={cat}>
                          <p className="px-2 mb-1.5 text-[10px] text-amber-600/30">
                            {CATEGORY_LABELS[cat]}
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {providers.map((p) => {
                              const Icon = PROVIDER_ICONS[p.key];
                              const color =
                                PROVIDER_ICON_COLORS[p.key] ??
                                "text-amber-400/60";
                              return (
                                <a
                                  key={p.key}
                                  href={p.connectHref}
                                  className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl bg-amber-900/10 border border-amber-900/20 hover:bg-amber-900/20 hover:border-amber-800/40 transition-colors group"
                                >
                                  <span className={`${color} opacity-70 group-hover:opacity-100 transition-opacity`}>
                                    {Icon ? <Icon size={20} /> : null}
                                  </span>
                                  <span className="text-[10px] text-amber-400/50 group-hover:text-amber-300/70 text-center leading-tight transition-colors">
                                    {p.name}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </section>
              )}

              {/* Empty search state */}
              {q && connected.length === 0 && availableByCategory.size === 0 && (
                <div className="mt-8 text-center">
                  <p className="text-xs text-amber-600/40">
                    No integrations match &ldquo;{search}&rdquo;
                  </p>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-amber-900/20 shrink-0">
              <p className="text-xs text-amber-600/30">
                Synced files appear in your workspace automatically.
              </p>
            </div>
          </div>

          {/* ── DETAIL PANEL ──────────────────────────────────────── */}
          <div
            className={`absolute inset-0 transition-transform duration-250 ease-out ${
              selectedKey ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {selectedProvider && selectedIntegration ? (
              <IntegrationDetail
                providerKey={selectedProvider.key}
                name={selectedProvider.name}
                description={selectedProvider.description}
                connectHref={selectedProvider.connectHref}
                integration={selectedIntegration}
                onAction={onAction}
                onBack={() => setSelectedKey(null)}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
