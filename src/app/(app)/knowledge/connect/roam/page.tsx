"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";

export default function RoamConnectPage() {
  const [apiToken, setApiToken] = useState("");
  const [graphName, setGraphName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiToken.trim() || !graphName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/connect/roam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiToken: apiToken.trim(),
          graphName: graphName.trim(),
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Connection failed — try again.");
        return;
      }

      router.push("/knowledge");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0a08] flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="flex items-center justify-center mb-8">
          <FlameLogo size={48} />
        </div>

        <h1 className="text-2xl font-black text-amber-50 text-center mb-2">
          Connect Roam Research
        </h1>

        <p className="text-center text-amber-400/60 text-sm mb-8 leading-relaxed">
          Get your API token from{" "}
          <a
            href="https://roamresearch.com/#/app/Settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300/80 underline hover:text-amber-200 transition-colors"
          >
            Roam Settings → API Tokens
          </a>
          .
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Graph name */}
          <div>
            <label className="block text-xs font-medium text-amber-400/70 mb-1.5">
              Graph name
            </label>
            <input
              type="text"
              value={graphName}
              onChange={(e) => setGraphName(e.target.value)}
              placeholder="my-brain"
              required
              autoComplete="off"
              className="w-full bg-[#120e08] border border-amber-900/40 rounded-xl px-4 py-3 text-sm text-amber-100 placeholder-amber-600/35 focus:outline-none focus:border-orange-600/50 transition-colors"
            />
            <p className="mt-1.5 text-xs text-amber-600/40 leading-relaxed">
              The slug in your Roam URL:{" "}
              <span className="font-mono">
                roamresearch.com/#/app/
                <span className="text-amber-500/70">graph-name</span>
              </span>
            </p>
          </div>

          {/* API token */}
          <div>
            <label className="block text-xs font-medium text-amber-400/70 mb-1.5">
              API token
            </label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="roam-graph-token-..."
              required
              className="w-full bg-[#120e08] border border-amber-900/40 rounded-xl px-4 py-3 text-sm text-amber-100 font-mono placeholder-amber-600/35 focus:outline-none focus:border-orange-600/50 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 text-xs text-red-400 leading-relaxed">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !apiToken.trim() || !graphName.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white text-sm font-semibold hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Connecting…" : "Connect →"}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link
            href="/knowledge"
            className="text-sm text-amber-400/40 hover:text-amber-400/70 transition-colors"
          >
            ← Back to Knowledge Base
          </Link>
        </div>
      </div>
    </div>
  );
}
