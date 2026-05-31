export default function MentorsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-amber-400/60">
          Your judge configurations — the Opus-backed mentors that score your
          student&apos;s responses and drive the reward signal.
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
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-600/50"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div>
          <p className="text-amber-200/40 text-sm font-medium mb-1">
            No mentors configured
          </p>
          <p className="text-amber-400/25 text-xs max-w-sm">
            A mentor pairs Opus with your knowledge base to score student
            responses. Configure one to start training.
          </p>
        </div>
      </div>
    </div>
  );
}
