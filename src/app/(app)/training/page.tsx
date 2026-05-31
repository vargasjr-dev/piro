export default function TrainingSessionsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-amber-400/60">
          Run GRPO passes with your Opus judge to update your model&apos;s weights.
        </p>
      </div>

      {/* Empty state */}
      <div className="border border-dashed border-amber-900/30 rounded-2xl p-16 flex flex-col items-center text-center gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-900/20 flex items-center justify-center">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            className="text-amber-600/50"
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-amber-200/40 text-sm font-medium mb-1">
            No training sessions yet
          </p>
          <p className="text-amber-400/25 text-xs max-w-sm">
            Build your knowledge base first, then kick off your first training
            session to start shaping your model.
          </p>
        </div>
      </div>
    </div>
  );
}
