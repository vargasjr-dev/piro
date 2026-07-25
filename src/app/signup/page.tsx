"use client";

import { useState } from "react";
import Link from "next/link";
import PublicNavbar from "~/components/PublicNavbar";
import { authClient } from "~/lib/auth.client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl") || "/dashboard";
      const { error: authError } = await authClient.signUp.email({
        name,
        email,
        password,
      });
      if (authError) throw new Error(authError.message || "Signup failed");
      window.location.href = callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <PublicNavbar isLoggedIn={false} />
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-orange-600/8 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          <div className="bg-[#1a1208]/80 border border-amber-900/30 rounded-2xl p-8 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-amber-50 mb-2 text-center">Start training</h1>
          <p className="text-amber-400/50 text-sm text-center mb-6">Your model begins here.</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-amber-300/70 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-[#0d0a08] border border-amber-900/30 rounded-xl text-amber-50 placeholder-amber-900/50 focus:outline-none focus:border-orange-500/60 transition"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-amber-300/70 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-[#0d0a08] border border-amber-900/30 rounded-xl text-amber-50 placeholder-amber-900/50 focus:outline-none focus:border-orange-500/60 transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-amber-300/70 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 bg-[#0d0a08] border border-amber-900/30 rounded-xl text-amber-50 placeholder-amber-900/50 focus:outline-none focus:border-orange-500/60 transition"
                placeholder="Min. 8 characters"
              />
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-800/50 text-red-300 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          {/* Social login */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-amber-900/30" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#1a1208] px-3 text-amber-400/40">or</span>
            </div>
          </div>

          <button
            onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" })}
            className="w-full py-3 bg-[#24292e] text-white font-semibold rounded-xl hover:bg-[#2f363d] transition-all flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.81 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>

          <p className="mt-6 text-center text-sm text-amber-400/60">
            Already have an account?{" "}
            <Link href="/login" className="text-orange-400 hover:text-orange-300 transition">Sign in</Link>
          </p>
        </div>
      </div>
      </div>
    </main>
  );
}
