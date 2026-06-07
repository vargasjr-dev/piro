"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App section error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full space-y-4">
        <h2 className="text-amber-100 font-bold text-sm">Page error</h2>
        <pre className="text-xs text-red-400/80 bg-red-950/30 border border-red-900/30 rounded-xl p-4 overflow-auto whitespace-pre-wrap">
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-amber-900/30 border border-amber-800/30 text-amber-300 text-sm hover:bg-amber-900/50 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
