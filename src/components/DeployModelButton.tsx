"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { modelIdSchema } from "~/lib/model-identifiers";

export type PretrainedModelOption = {
  id: string;
  name: string;
};

type DeployModelButtonProps = {
  pretrainedModels: PretrainedModelOption[];
};

export default function DeployModelButton({
  pretrainedModels,
}: DeployModelButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState("");
  const [sourceModelId, setSourceModelId] = useState(
    pretrainedModels[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  function openModal() {
    setModelId("");
    setSourceModelId(pretrainedModels[0]?.id ?? "");
    setError(null);
    setOpen(true);
    setSuggestionLoading(true);
    void fetch("/api/models/suggestion")
      .then(async (response) => {
        const body = (await response.json()) as {
          modelId?: string;
          error?: string;
        };
        if (!response.ok || !body.modelId) {
          throw new Error(body.error ?? "We could not generate a model ID");
        }
        setModelId(body.modelId);
      })
      .catch((suggestionError: unknown) => {
        setError(
          suggestionError instanceof Error
            ? suggestionError.message
            : "We could not generate a model ID",
        );
      })
      .finally(() => setSuggestionLoading(false));
  }

  function closeModal() {
    if (!submitting) setOpen(false);
  }

  async function deploy() {
    const parsed = modelIdSchema.safeParse(modelId);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose a valid model ID");
      return;
    }
    if (!sourceModelId) {
      setError("Choose a pretrained model to deploy");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: parsed.data,
          sourceModelId,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "We could not create your deployment");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("We could not reach Piro. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="mt-6 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-[#180d07] shadow-[0_10px_30px_rgba(249,115,22,0.16)] transition hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2 focus:ring-offset-[#0d0a08]"
      >
        Deploy Your Model
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deploy-model-title"
            className="w-full max-w-lg rounded-3xl border border-orange-500/25 bg-[#17100b] p-6 text-left shadow-2xl shadow-black/50 sm:p-8"
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2
                  id="deploy-model-title"
                  className="text-2xl font-black text-amber-50"
                >
                  Name your deployment
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-amber-500/60 transition hover:bg-amber-50/5 hover:text-amber-100"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-amber-200/60">
              Choose a globally unique deployment ID. It names your private
              stateful deployment of the selected pretrained model.
            </p>
            <label
              htmlFor="model-id"
              className="mt-6 block text-xs font-bold uppercase tracking-[0.16em] text-amber-500/70"
            >
              Deployment ID
            </label>
            <input
              id="model-id"
              value={modelId}
              disabled={suggestionLoading}
              onChange={(event) => {
                setModelId(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void deploy();
              }}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="mt-2 min-h-12 w-full rounded-xl border border-amber-800/40 bg-[#0e0b09] px-4 font-mono text-base text-amber-50 outline-none transition placeholder:text-amber-700/50 focus:border-orange-400/70 focus:ring-2 focus:ring-orange-400/15"
              aria-describedby={error ? "model-id-error" : undefined}
              placeholder={
                suggestionLoading ? "Generating a suggestion…" : undefined
              }
            />
            <label
              htmlFor="pretrained-model"
              className="mt-5 block text-xs font-bold uppercase tracking-[0.16em] text-amber-500/70"
            >
              Pretrained model
            </label>
            <select
              id="pretrained-model"
              value={sourceModelId}
              onChange={(event) => {
                setSourceModelId(event.target.value);
                setError(null);
              }}
              disabled={submitting || pretrainedModels.length === 0}
              className="mt-2 min-h-12 w-full rounded-xl border border-amber-800/40 bg-[#0e0b09] px-4 text-base text-amber-50 outline-none transition focus:border-orange-400/70 focus:ring-2 focus:ring-orange-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pretrainedModels.length === 0 ? (
                <option value="">No pretrained models available</option>
              ) : (
                pretrainedModels.map((pretrainedModel) => (
                  <option key={pretrainedModel.id} value={pretrainedModel.id}>
                    {pretrainedModel.name}
                  </option>
                ))
              )}
            </select>
            {error && (
              <p
                id="model-id-error"
                role="alert"
                className="mt-3 text-sm text-rose-300"
              >
                {error}
              </p>
            )}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-xl border border-amber-800/35 px-5 py-3 text-sm font-semibold text-amber-200/70 transition hover:border-amber-600/50 hover:text-amber-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deploy()}
                disabled={
                  submitting || suggestionLoading || !modelId || !sourceModelId
                }
                className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-[#180d07] transition hover:bg-orange-400 disabled:cursor-wait disabled:opacity-60"
              >
                {suggestionLoading
                  ? "Generating suggestion…"
                  : submitting
                    ? "Creating deployment…"
                    : "Create deployment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
