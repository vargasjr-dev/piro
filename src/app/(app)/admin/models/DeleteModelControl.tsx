"use client";

import { useState } from "react";

export function DeleteModelControl({
  model,
}: {
  model: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteModel() {
    if (
      !window.confirm(
        `Delete ${model.name}? This permanently removes the model and its stored weights.`,
      )
    ) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/models/${encodeURIComponent(model.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error ?? "Model deletion failed");
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Model deletion failed",
      );
      setPending(false);
    }
  }

  return (
    <div className="shrink-0 lg:text-right">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-300/60 hover:bg-red-500/20"
      >
        {open ? "Close delete" : "Delete model"}
      </button>
      {open ? (
        <div className="mt-2 rounded-xl border border-red-500/25 bg-red-950/20 p-3 lg:w-[260px]">
          <p className="text-left text-[11px] leading-relaxed text-red-200/75">
            Permanently remove this model and its stored weights.
          </p>
          <button
            type="button"
            onClick={deleteModel}
            disabled={pending}
            className="mt-2 w-full rounded-lg border border-red-500/35 px-3 py-2 text-xs font-semibold text-red-200 transition enabled:hover:bg-red-500/15 disabled:cursor-not-allowed disabled:border-red-900/30 disabled:text-red-300/35"
          >
            {pending ? "Deleting…" : "Permanently delete"}
          </button>
          {error ? (
            <p className="mt-2 text-left text-xs text-red-300">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
