"use client";

import Link from "next/link";
import { useState } from "react";

const INCLUDED = [
  {
    title: "One private deployment",
    detail: "Create a dedicated model from the Models page.",
  },
  {
    title: "Stateful inference",
    detail: "Keep durable state across the conversations that matter.",
  },
  {
    title: "Two model updates each month",
    detail: "Train on your data and keep the deployment moving forward.",
  },
  {
    title: "API access",
    detail: "Call your model from your own products with a Piro API key.",
  },
];

const FLOW = [
  { number: "01", title: "Deploy", detail: "Name your private model." },
  { number: "02", title: "Adapt", detail: "Give it your data and context." },
  { number: "03", title: "Infer", detail: "Call the stateful endpoint." },
];

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST" });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(
          body.error ?? "We could not start checkout. Please try again.",
        );
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("We could not reach checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 bg-[radial-gradient(circle_at_35%_0%,rgba(249,115,22,0.12),transparent_58%)]" />
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_420px] lg:items-center lg:gap-20">
          <section className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">
              Private stateful inference
            </p>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-amber-50 sm:text-6xl sm:leading-[1.02]">
              Deploy a model that remembers.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-amber-200/60 sm:text-lg">
              Give your model a private home, durable state, and an endpoint you
              can call whenever you need it. Piro is for intelligence that gets
              more useful because it remembers you.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {FLOW.map((step) => (
                <div
                  key={step.number}
                  className="rounded-2xl border border-amber-900/25 bg-amber-950/10 p-4"
                >
                  <p className="font-mono text-xs font-bold text-orange-400/70">
                    {step.number}
                  </p>
                  <p className="mt-5 text-sm font-bold text-amber-50">
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-200/45">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 border-t border-amber-900/20 pt-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/45">
                What you get
              </p>
              <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-300">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="m2.25 6.2 2.35 2.35 5.15-5.1"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-amber-100">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-amber-200/45">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-orange-500/5 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-orange-500/35 bg-[#15100c] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
              <div className="border-b border-amber-900/20 px-7 pb-6 pt-7 sm:px-8 sm:pt-8">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
                    Piro deployment
                  </p>
                  <span className="rounded-full border border-orange-400/25 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200/80">
                    Pro
                  </span>
                </div>
                <div className="mt-7 flex items-end gap-2">
                  <span className="text-6xl font-black tracking-[-0.06em] text-amber-50">
                    $100
                  </span>
                  <span className="mb-2 text-sm text-amber-200/45">
                    / month
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-amber-200/55">
                  Everything you need to move from an empty Models page to a
                  private, callable deployment.
                </p>
              </div>

              <div className="px-7 py-6 sm:px-8">
                <div className="rounded-xl border border-amber-900/20 bg-black/10 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-100/80">
                    Your next step after checkout
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-200/45">
                    Open Models, choose a model ID, and deploy your private
                    endpoint.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleUpgrade()}
                  disabled={loading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-4 text-sm font-bold text-[#180d07] shadow-[0_12px_35px_rgba(249,115,22,0.18)] transition hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2 focus:ring-offset-[#15100c] disabled:cursor-wait disabled:opacity-60"
                >
                  {loading ? "Opening secure checkout…" : "Start deploying"}
                  {!loading && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3.25 8h9.5M8.5 3.75 12.75 8 8.5 12.25"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                {error && (
                  <p
                    className="mt-3 text-center text-xs text-red-300"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <p className="mt-4 text-center text-xs leading-5 text-amber-200/35">
                  Cancel anytime. Billing is handled securely by Stripe.
                </p>
              </div>
            </div>

            <Link
              href="/models"
              className="mt-5 block text-center text-xs font-semibold text-amber-200/45 transition hover:text-amber-100"
            >
              Back to Models
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
