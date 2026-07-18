"use client";

import Link from "next/link";
import { useState } from "react";
import FlameLogo from "~/components/FlameLogo";

const PRO_FEATURES = [
  ["🏋️", "2 training runs / month", "Full GPU training on your data"],
  ["⚡", "Unlimited inference", "Query your trained model anytime"],
  ["🤖", "Architecture Copilot", "Design help for your model classes"],
  ["📊", "Benchmark suite", "Sanity, generalization, adaptive compute"],
  ["📦", "Model versioning", "Roll back to any prior checkpoint"],
  ["🔑", "API access", "Use your model in your own apps"],
];

const ENTERPRISE_FEATURES = [
  "Custom training volume",
  "Dedicated support",
  "Private deployments",
  "Team access and controls",
];

export default function PricingPage() {
  const [proLoading, setProLoading] = useState(false);
  const [enterpriseLoading, setEnterpriseLoading] = useState(false);
  const [enterpriseSent, setEnterpriseSent] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState("");
  const [proError, setProError] = useState("");

  async function handleProCheckout() {
    setProLoading(true);
    setProError("");
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST" });
      if (response.status === 401) {
        window.location.href = "/signup?callbackUrl=%2Fupgrade";
        return;
      }
      const body = await response.json();
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      throw new Error("Checkout is unavailable");
    } catch {
      setProError("Checkout is unavailable right now. Please try again.");
      setProLoading(false);
    }
  }

  async function handleEnterpriseSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnterpriseLoading(true);
    setEnterpriseError("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/enterprise-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        company: form.get("company"),
        teamSize: form.get("teamSize"),
        message: form.get("message"),
        website: form.get("website"),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setEnterpriseError(body?.error ?? "Something went wrong. Please try again.");
    } else {
      setEnterpriseSent(true);
      event.currentTarget.reset();
    }

    setEnterpriseLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition">
            <FlameLogo size={24} />
            <span className="font-bold text-amber-50 tracking-tight">Piro</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/docs" className="text-amber-300/60 hover:text-amber-100 transition-colors">Docs</Link>
          </nav>
        </div>
      </header>

      <section className="px-4 py-20 sm:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <p className="text-orange-400/80 text-sm font-semibold uppercase tracking-widest mb-4">Pricing</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-amber-50 mb-6">
              Your model. Your data. Your terms.
            </h1>
            <p className="text-lg text-amber-200/60 leading-relaxed">
              Start exploring for free, train seriously with Pro, or bring Piro into your organization with Enterprise.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 items-start">
            <section className="rounded-2xl border border-amber-900/30 bg-[#13100c] p-7 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-widest text-amber-400/60 mb-3">Free</p>
              <h2 className="text-3xl font-bold text-amber-50">$0</h2>
              <p className="text-sm text-amber-400/50 mt-2 min-h-12">Explore the Piro workflow before you commit.</p>
              <ul className="space-y-3 my-8 text-sm text-amber-200/70">
                <li>✓ Connect your first repository</li>
                <li>✓ Browse experiment structure</li>
                <li>✓ Explore docs and benchmarks</li>
                <li>✓ Upgrade when you are ready</li>
              </ul>
              <Link href="/signup" className="block text-center w-full py-3.5 rounded-xl border border-amber-700/40 text-amber-100 font-semibold hover:border-orange-500/60 hover:text-white transition-colors">
                Get started free
              </Link>
            </section>

            <section className="relative rounded-2xl border border-orange-500/50 bg-gradient-to-b from-orange-500/10 to-[#13100c] p-7 sm:p-8 shadow-[0_0_50px_rgba(234,88,12,0.1)]">
              <div className="absolute -top-3 left-7 rounded-full bg-orange-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">Most popular</div>
              <p className="text-sm font-semibold uppercase tracking-widest text-orange-400 mb-3">Pro</p>
              <div className="flex items-end gap-1">
                <h2 className="text-3xl font-bold text-amber-50">$100</h2>
                <span className="text-amber-400/50 mb-1">/month</span>
              </div>
              <p className="text-sm text-amber-400/60 mt-2 min-h-12">A tiny model trained on your data, getting smarter over time.</p>
              <ul className="space-y-3 my-8">
                {PRO_FEATURES.map(([icon, label, detail]) => (
                  <li key={label} className="flex items-start gap-3">
                    <span className="text-base mt-0.5">{icon}</span>
                    <div><p className="text-sm text-amber-100 font-medium">{label}</p><p className="text-xs text-amber-400/40">{detail}</p></div>
                  </li>
                ))}
              </ul>
              {proError && <p className="mb-3 text-sm text-red-300">{proError}</p>}
              <button onClick={handleProCheckout} disabled={proLoading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold hover:from-orange-400 hover:to-red-500 transition-all disabled:opacity-60">
                {proLoading ? "Redirecting…" : "Start Pro — $100/mo"}
              </button>
              <p className="text-center text-xs text-amber-400/30 mt-4">You’ll create an account before checkout.</p>
            </section>

            <section className="rounded-2xl border border-amber-900/30 bg-[#13100c] p-7 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-widest text-amber-400/60 mb-3">Enterprise</p>
              <h2 className="text-3xl font-bold text-amber-50">Talk to us</h2>
              <p className="text-sm text-amber-400/50 mt-2">Bring your team, data, and deployment requirements.</p>
              <ul className="space-y-2 my-6 text-sm text-amber-200/70">
                {ENTERPRISE_FEATURES.map((feature) => <li key={feature}>✓ {feature}</li>)}
              </ul>

              {enterpriseSent ? (
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-5 text-sm text-orange-200">
                  Thanks — your note is on its way. We’ll be in touch.
                </div>
              ) : (
                <form onSubmit={handleEnterpriseSubmit} className="space-y-3">
                  <input name="name" required placeholder="Your name" className="pricing-input" />
                  <input name="email" required type="email" placeholder="Work email" className="pricing-input" />
                  <input name="company" required placeholder="Company" className="pricing-input" />
                  <input name="teamSize" required placeholder="Team size" className="pricing-input" />
                  <textarea name="message" required rows={4} placeholder="What are you building?" className="pricing-input resize-none" />
                  <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                  {enterpriseError && <p className="text-sm text-red-300">{enterpriseError}</p>}
                  <button type="submit" disabled={enterpriseLoading} className="w-full py-3.5 rounded-xl border border-orange-500/50 text-orange-200 font-semibold hover:bg-orange-500/10 transition-colors disabled:opacity-60">
                    {enterpriseLoading ? "Sending…" : "Talk to us"}
                  </button>
                </form>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
