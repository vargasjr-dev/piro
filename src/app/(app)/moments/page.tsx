export default function LearningMomentsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-amber-400/60">
          Detected corrections, discoveries, and drift events from your
          interactions.
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
              d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-amber-200/40 text-sm font-medium mb-1">
            No learning moments captured
          </p>
          <p className="text-amber-400/25 text-xs max-w-sm">
            Learning moments are detected automatically as your model trains —
            corrections, surprises, and shifts in what you respond to.
          </p>
        </div>
      </div>
    </div>
  );
}
