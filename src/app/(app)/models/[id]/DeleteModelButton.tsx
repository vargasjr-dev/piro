"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteModelButton({ modelId }: { modelId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setState("deleting");
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Delete failed");
      }
      router.push("/models");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setState("idle");
    }
  }

  if (state === "confirm") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-red-400/60">Delete permanently?</span>
        <button
          onClick={handleDelete}
          className="text-[10px] font-medium px-2 py-1 rounded bg-red-900/30 text-red-400/80 border border-red-800/30 hover:bg-red-900/50 transition-colors"
        >
          Yes, delete
        </button>
        <button
          onClick={() => setState("idle")}
          className="text-[10px] font-medium px-2 py-1 rounded bg-amber-900/20 text-amber-600/50 border border-amber-800/20 hover:bg-amber-900/30 transition-colors"
        >
          Cancel
        </button>
        {error && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    );
  }

  if (state === "deleting") {
    return <span className="text-[10px] text-amber-700/30">Deleting…</span>;
  }

  return (
    <button
      onClick={() => setState("confirm")}
      className="text-[10px] font-medium px-2 py-1 rounded bg-red-900/20 text-red-400/50 border border-red-800/20 hover:bg-red-900/35 hover:text-red-400/70 transition-colors"
    >
      Delete
    </button>
  );
}
