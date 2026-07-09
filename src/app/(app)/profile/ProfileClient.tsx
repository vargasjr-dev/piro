"use client";

import { useState } from "react";
import { authClient } from "~/lib/auth.client";

interface Props {
  githubLinked: boolean;
}

export default function ProfileClient({ githubLinked }: Props) {
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");

  const handleConnectGitHub = async () => {
    setError("");
    setLinking(true);
    try {
      // linkSocial initiates the OAuth flow and redirects to GitHub.
      // On return, better-auth links the GitHub account to the current session.
      await authClient.linkSocial({
        provider: "github",
        callbackURL: "/profile",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect GitHub");
      setLinking(false);
    }
  };

  return (
    <section className="bg-[#1a1208]/80 border border-amber-900/30 rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-amber-300/70 uppercase tracking-wide mb-4">
        Connections
      </h2>

      {/* GitHub */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#24292e] flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.81 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </div>
          <div>
            <p className="text-amber-100 text-sm font-medium">GitHub</p>
            {githubLinked ? (
              <p className="text-emerald-400/70 text-xs mt-0.5">Connected</p>
            ) : (
              <p className="text-amber-400/40 text-xs mt-0.5">Not connected</p>
            )}
          </div>
        </div>

        {githubLinked ? (
          <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Linked
          </span>
        ) : (
          <button
            onClick={handleConnectGitHub}
            disabled={linking}
            className="px-4 py-2 bg-[#24292e] text-white text-sm font-medium rounded-lg hover:bg-[#2f363d] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {linking ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Connecting...
              </>
            ) : (
              "Connect GitHub"
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-red-950/50 border border-red-800/50 text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
    </section>
  );
}
