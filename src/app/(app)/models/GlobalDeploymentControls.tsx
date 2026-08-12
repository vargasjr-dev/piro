"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-50`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export default function GlobalDeploymentControls({
  deploymentId,
  enabled,
  disableAction,
  deleteAction,
}: {
  deploymentId: string;
  enabled: boolean;
  disableAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {enabled && (
        <form action={disableAction}>
          <input type="hidden" name="deploymentId" value={deploymentId} />
          <SubmitButton className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10">
            Disable
          </SubmitButton>
        </form>
      )}
      {!enabled && (
        <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
          Disabled
        </span>
      )}
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Delete this global deployment? The deployment will be removed, but the model and its weights will be kept.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="deploymentId" value={deploymentId} />
        <SubmitButton className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20">
          Delete
        </SubmitButton>
      </form>
    </div>
  );
}
