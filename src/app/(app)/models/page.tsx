export default function ModelsPage() {
  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">
            Models
          </h1>
          <p className="text-xs text-amber-400/40 mt-0.5">
            Trained model checkpoints — each one a snapshot of your personal intelligence
          </p>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 px-6 py-10 flex flex-col items-center justify-center">
        <div className="border border-dashed border-amber-900/30 rounded-2xl p-16 flex flex-col items-center text-center gap-4 max-w-md w-full">
          <div className="w-10 h-10 rounded-full bg-amber-900/20 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-600/50"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
          </div>
          <div>
            <p className="text-amber-200/40 text-sm font-medium mb-1">
              No models trained yet
            </p>
            <p className="text-amber-400/30 text-xs leading-relaxed">
              Complete a training session to create your first model checkpoint.
              Each model is a snapshot of a specific architecture phase.
            </p>
          </div>
          <div className="mt-2 px-3 py-1.5 border border-amber-900/30 rounded-lg">
            <span className="text-xs text-amber-400/30 font-mono">
              Phase 0 — CTM Core · not started
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
