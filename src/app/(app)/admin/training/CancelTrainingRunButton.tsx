"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelTrainingRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelRun() {
    if (
      !window.confirm(
        "Cancel this training run? The worker will stop at its next checkpoint or progress boundary.",
      )
    )
      return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/training-runs/${runId}/cancel`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error ?? "Unable to cancel training run");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to cancel training run",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={cancelRun}
        disabled={pending}
        className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 transition hover:border-red-300/60 hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-50"
      >
        {pending ? "Cancelling…" : "Cancel run"}
      </button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
