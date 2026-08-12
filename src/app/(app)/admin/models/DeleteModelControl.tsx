"use client";

import { useState } from "react";

export function DeleteModelControl({
  models,
}: {
  models: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedModel = models.find((item) => item.id === selectedId);

  async function deleteModel() {
    if (!selectedModel) return;
    if (
      !window.confirm(
        `Delete ${selectedModel.name}? This permanently removes the model and its stored weights.`,
      )
    ) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/models/${encodeURIComponent(selectedModel.id)}`,
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

  if (models.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-300/60 hover:bg-red-500/20"
      >
        {open ? "Close delete" : "Delete model"}
      </button>
      {open ? (
        <div className="w-full rounded-xl border border-red-500/25 bg-red-950/20 p-3 sm:w-[300px]">
          <label className="block text-[11px] text-red-200/70">
            Model to remove
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={pending}
              className="mt-1 w-full rounded-lg border border-red-500/25 bg-[#0d0a08] px-2 py-2 text-xs text-amber-100 outline-none focus:border-red-400/60"
            >
              <option value="">Choose a model</option>
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={deleteModel}
            disabled={!selectedModel || pending}
            className="mt-2 w-full rounded-lg border border-red-500/35 px-3 py-2 text-xs font-semibold text-red-200 transition enabled:hover:bg-red-500/15 disabled:cursor-not-allowed disabled:border-red-900/30 disabled:text-red-300/35"
          >
            {pending ? "Deleting…" : "Permanently delete"}
          </button>
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
