export default function StudentsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-amber-400/60">
          Your trained model iterations — each student is the result of a
          completed training session.
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
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>
        <div>
          <p className="text-amber-200/40 text-sm font-medium mb-1">
            No students yet
          </p>
          <p className="text-amber-400/25 text-xs max-w-sm">
            Run your first training session to produce a student. Each student
            is a snapshot of your model at a point in time.
          </p>
        </div>
      </div>
    </div>
  );
}
