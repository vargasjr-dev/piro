"use client";

import { useState } from "react";
import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";
import { authClient } from "~/lib/auth.client";

export default function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const destination = callbackUrl || "/dashboard";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: authError } = await authClient.signIn.email({ email, password });
      if (authError) throw new Error(authError.message || "Login failed");
      window.location.href = destination;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0a08] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-orange-600/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/"><FlameLogo size={52} /></Link>
        </div>

        <div className="bg-[#1a1208]/80 border border-amber-900/30 rounded-2xl p-8 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-amber-50 mb-6 text-center">Welcome back</h1>

          <form onSubmit={handleLogin} className="space-y-4">
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
                className="w-full px-4 py-2.5 bg-[#0d0a08] border border-amber-900/30 rounded-xl text-amber-50 placeholder-amber-900/50 focus:outline-none focus:border-orange-500/60 transition"
                placeholder="••••••••"
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
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm text-amber-400/60">
            <Link href="/forgot-password" className="hover:text-orange-400 transition">Forgot password?</Link>
            <Link href="/signup" className="hover:text-orange-400 transition">Create account →</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
