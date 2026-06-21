"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ArchiveModelButton({ modelId }: { modelId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "archiving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setState("archiving");
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}`, { method: "PATCH" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push("/models");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setState("idle");
    }
  }

  if (state === "confirm") {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-[10px] text-red-400/70">{error}</span>}
        <button
          onClick={() => setState("idle")}
          className="text-xs text-amber-600/40 hover:text-amber-400/70 transition-colors px-2 py-1"
        >
          Cancel
        </button>
        <button
          onClick={handleArchive}
          className="text-xs font-medium text-amber-400/70 hover:text-amber-300/90 border border-amber-700/30 hover:border-amber-600/50 rounded-lg px-3 py-1.5 transition-colors"
        >
          Archive
        </button>
      </div>
    );
  }

  if (state === "archiving") {
    return (
      <span className="text-xs text-amber-600/40 px-2 py-1">Archiving…</span>
    );
  }

  return (
    <button
      onClick={() => setState("confirm")}
      className="text-amber-700/30 hover:text-amber-500/50 transition-colors p-1.5 rounded-lg hover:bg-amber-900/10"
      title="Archive model"
    >
      {/* Archive / box icon */}
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    </button>
  );
}
