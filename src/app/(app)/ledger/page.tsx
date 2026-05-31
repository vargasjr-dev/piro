export default function CapabilityLedgerPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-amber-400/60">
          Track skills your model has accumulated and catch regressions before
          they stick.
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
              d="M9 11l3 3L22 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-amber-200/40 text-sm font-medium mb-1">
            Ledger is empty
          </p>
          <p className="text-amber-400/25 text-xs max-w-sm">
            Capabilities are logged automatically after each training pass. Once
            your model starts learning, they&apos;ll appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
