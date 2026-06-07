"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-[#0d0a08] flex items-center justify-center px-4">
        <div className="max-w-lg w-full space-y-4">
          <h1 className="text-amber-100 font-bold text-lg">Something went wrong</h1>
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
      </body>
    </html>
  );
}
