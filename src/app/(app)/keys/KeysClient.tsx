"use client";

import { useState } from "react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface Props {
  initialKeys: ApiKey[];
}

export default function KeysClient({ initialKeys }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedName, setRevealedName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json() as { key?: { id: string; name: string; keyPrefix: string; createdAt: string; rawKey: string }; error?: string };
      if (!res.ok || !data.key) { setError(data.error ?? "Failed to create key"); return; }
      const { rawKey, ...meta } = data.key;
      setKeys((prev) => [...prev, { ...meta, lastUsedAt: null, revokedAt: null }]);
      setRevealedKey(rawKey);
      setRevealedName(meta.name);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await fetch(`/api/keys/${id}`, { method: "DELETE" });
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)),
      );
    } finally {
      setRevoking(null);
    }
  }

  function copy() {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <div className="p-6 max-w-2xl space-y-6">

      {/* ── One-time key reveal ──────────────────────────────────────── */}
      {revealedKey && (
        <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400/70 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-xs font-semibold text-orange-400/80">
              Copy <span className="font-mono">{revealedName}</span> — shown once, never again
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 font-mono text-xs text-amber-200/80 bg-[#0d0a08] px-3 py-2 rounded-lg border border-amber-900/20 truncate select-all">
              {revealedKey}
            </code>
            <button
              onClick={copy}
              className="shrink-0 px-3 py-2 rounded-lg border border-amber-900/20 text-xs font-medium text-amber-400/60 hover:text-amber-200 hover:border-amber-700/40 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => { setRevealedKey(null); setRevealedName(null); }}
            className="text-[11px] text-amber-700/40 hover:text-amber-500/60 transition-colors"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* ── Create new key ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-900/20 bg-amber-900/5 p-4 space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
          New API key
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Name (e.g. VargasJR)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
            className="flex-1 min-w-0 bg-[#0d0a08] border border-amber-900/20 rounded-lg px-3 py-2 text-sm text-amber-100 placeholder:text-amber-700/30 focus:outline-none focus:border-orange-500/30"
          />
          <button
            onClick={() => void create()}
            disabled={creating || !newName.trim()}
            className="shrink-0 px-4 py-2 rounded-lg bg-orange-500/15 border border-orange-500/25 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400/70">{error}</p>}
      </div>

      {/* ── Active keys ─────────────────────────────────────────────── */}
      {active.length > 0 && (
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50 mb-3">
            Active keys
          </h2>
          <div className="rounded-xl border border-amber-900/20 overflow-hidden divide-y divide-amber-900/10">
            {active.map((k) => (
              <div key={k.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-200/80">{k.name}</p>
                  <p className="text-[11px] font-mono text-amber-600/50 mt-0.5">
                    {k.keyPrefix}••••••••••••••••••••
                  </p>
                  <p className="text-[10px] text-amber-700/35 mt-0.5">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt
                      ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : " · Never used"}
                  </p>
                </div>
                <button
                  onClick={() => void revoke(k.id)}
                  disabled={revoking === k.id}
                  className="shrink-0 text-[11px] text-amber-700/40 hover:text-red-400/70 transition-colors disabled:opacity-40"
                >
                  {revoking === k.id ? "Revoking…" : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {active.length === 0 && !revealedKey && (
        <p className="text-sm text-amber-600/40 text-center py-8">
          No active keys. Create one above.
        </p>
      )}

      {/* ── Revoked keys ─────────────────────────────────────────────── */}
      {revoked.length > 0 && (
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/30 mb-3">
            Revoked
          </h2>
          <div className="rounded-xl border border-amber-900/10 overflow-hidden divide-y divide-amber-900/10 opacity-50">
            {revoked.map((k) => (
              <div key={k.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-400/40 line-through">{k.name}</p>
                  <p className="text-[10px] text-amber-700/25 mt-0.5">
                    Revoked {new Date(k.revokedAt!).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
