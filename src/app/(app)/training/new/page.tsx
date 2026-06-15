import Link from "next/link";
import NewTrainingForm from "./NewTrainingForm";

export default function NewTrainingRunPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link
          href="/training"
          className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">New Training Run</h1>
          <p className="text-[11px] text-amber-400/40 mt-0.5">Choose a model template and data source</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <NewTrainingForm />
      </div>
    </div>
  );
}
