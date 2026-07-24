"use client";

import Link from "next/link";
import { useState } from "react";
import FlameLogo from "~/components/FlameLogo";

const PRO_FEATURES = [
  ["🧠", "Dedicated stateful model", "Continuity between invocations"],
  ["⚡", "Latest-model inference", "Your deployment follows the newest experiment"],
  ["♾️", "Unlimited inference", "No per-token meter"],
  ["📦", "Versioned state", "Inspect and recover deployment checkpoints"],
  ["🔑", "API access", "Use your model in your own apps"],
  ["📊", "Research-grade evals", "Track Piro as it improves"],
];

const ENTERPRISE_FEATURES = [
  "Custom deployment volume",
  "Dedicated support",
  "Private model environments",
  "Team access and controls",
];

type PricingClientProps = {
  latestModelLabel: string;
};

export default function PricingClient({ latestModelLabel }: PricingClientProps) {
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
    try {
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
    } catch {
      setEnterpriseError("Something went wrong. Please try again.");
    } finally {
      setEnterpriseLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#0d0a08] text-amber-100">
      <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight text-amber-50 transition-opacity hover:opacity-80">
            <FlameLogo size={28} />
            Piro
          </Link>
          <nav className="flex items-center gap-5 text-sm text-amber-300/70">
            <Link href="/docs" className="transition-colors hover:text-amber-100">Docs</Link>
            <Link href="/" className="transition-colors hover:text-amber-100">Home</Link>
          </nav>
        </div>
      </header>

      <section className="relative px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28">
        <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-orange-600/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-7 flex w-fit items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
            Choose your deployment
          </div>
          <h1 className="text-5xl font-black leading-[0.98] tracking-[-0.045em] text-amber-50 sm:text-7xl">
            Intelligence with
            <span className="block bg-gradient-to-r from-orange-300 via-amber-200 to-red-500 bg-clip-text text-transparent ember-text-glow">
              somewhere to grow.
            </span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-amber-200/65 sm:text-xl">
            Start free, deploy a dedicated stateful Piro model, or bring Piro into your organization. Every paid deployment follows the latest experiment.
          </p>
        </div>
      </section>

      <section className="relative border-t border-amber-900/20 bg-[#0a0806] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[0.8fr_1.15fr_0.8fr] lg:items-start">
          <section className="rounded-3xl border border-amber-900/35 bg-[#13100c] p-7 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400/60">Explore</p>
            <h2 className="mt-4 text-3xl font-bold text-amber-50">Free</h2>
            <p className="mt-3 min-h-14 text-sm leading-relaxed text-amber-300/55">See how Piro is structured before you deploy a model.</p>
            <ul className="my-8 space-y-4 text-sm text-amber-200/70">
              {["Connect your first repository", "Browse experiment structure", "Explore docs and benchmarks", "Upgrade when you are ready"].map((feature) => (
                <li key={feature} className="flex gap-3"><span className="text-orange-400">✓</span><span>{feature}</span></li>
              ))}
            </ul>
            <Link href="/signup" className="block rounded-xl border border-amber-700/40 px-5 py-3.5 text-center font-semibold text-amber-100 transition-colors hover:border-orange-500/60 hover:bg-orange-500/5">Get started free</Link>
          </section>

          <section className="relative rounded-3xl border border-orange-500/50 bg-gradient-to-b from-orange-500/12 via-[#13100c] to-[#0d0a08] p-7 shadow-[0_0_70px_rgba(234,88,12,0.12)] sm:p-9">
            <div className="absolute -top-3 left-7 rounded-full bg-orange-500 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white">The Piro deployment</div>
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">Piro</p>
                <div className="mt-4 flex items-end gap-2"><h2 className="text-5xl font-black text-amber-50">$100</h2><span className="mb-2 text-amber-400/60">/month</span></div>
              </div>
              <div className="rounded-full border border-emerald-400/30 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />current model track</div>
            </div>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-amber-200/70">Your own dedicated, stateful model with inference on <span className="font-semibold text-orange-200">{latestModelLabel}</span>.</p>
            <div className="mt-8 grid gap-4 border-y border-amber-800/30 py-7 sm:grid-cols-2">
              {PRO_FEATURES.map(([icon, label, detail]) => (
                <div key={label} className="flex items-start gap-3"><span className="mt-0.5 text-lg">{icon}</span><div><p className="text-sm font-semibold text-amber-50">{label}</p><p className="mt-1 text-xs leading-relaxed text-amber-300/50">{detail}</p></div></div>
              ))}
            </div>
            {proError && <p className="mt-5 text-sm text-red-300">{proError}</p>}
            <button onClick={handleProCheckout} disabled={proLoading} className="mt-7 w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4 text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500 disabled:cursor-not-allowed disabled:opacity-60 ember-glow">{proLoading ? "Redirecting…" : "Deploy Piro — $100/mo"}</button>
            <p className="mt-4 text-center text-xs text-amber-400/35">You’ll create an account before checkout. Cancel anytime.</p>
          </section>

          <section className="rounded-3xl border border-amber-900/35 bg-[#13100c] p-7 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400/60">For teams</p>
            <h2 className="mt-4 text-3xl font-bold text-amber-50">Enterprise</h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/55">Bring your team, data, and deployment requirements.</p>
            <ul className="my-7 space-y-3 text-sm text-amber-200/70">{ENTERPRISE_FEATURES.map((feature) => <li key={feature} className="flex gap-3"><span className="text-orange-400">✓</span><span>{feature}</span></li>)}</ul>
            {enterpriseSent ? (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-5 text-sm leading-relaxed text-orange-200">Thanks — your note is on its way. We’ll be in touch.</div>
            ) : (
              <form onSubmit={handleEnterpriseSubmit} className="space-y-3">
                <input name="name" required placeholder="Your name" className="pricing-input" />
                <input name="email" required type="email" placeholder="Work email" className="pricing-input" />
                <input name="company" required placeholder="Company" className="pricing-input" />
                <input name="teamSize" required placeholder="Team size" className="pricing-input" />
                <textarea name="message" required rows={4} placeholder="What are you building?" className="pricing-input resize-none" />
                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                {enterpriseError && <p className="text-sm text-red-300">{enterpriseError}</p>}
                <button type="submit" disabled={enterpriseLoading} className="w-full rounded-xl border border-orange-500/50 px-5 py-3.5 font-semibold text-orange-200 transition-colors hover:bg-orange-500/10 disabled:opacity-60">{enterpriseLoading ? "Sending…" : "Talk to us"}</button>
              </form>
            )}
          </section>
        </div>
      </section>

      <section className="border-t border-amber-900/20 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">The promise</p>
          <h2 className="mt-5 text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">No disposable chat window.<br /><span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">A model with continuity.</span></h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-amber-200/65">Your Piro deployment starts from the latest experiment and keeps its state as it works. The research moves forward; your model track moves with it.</p>
          <Link href="/" className="mt-9 inline-block rounded-xl border border-amber-700/50 px-7 py-3.5 font-semibold text-amber-100 transition-colors hover:border-orange-400/70 hover:bg-orange-500/5">Back to Piro →</Link>
          <div className="mt-12 flex justify-center"><FlameLogo size={40} /></div>
        </div>
      </section>

      <footer className="border-t border-amber-900/20 px-4 py-10 text-center text-xs text-amber-400/40"><p>Piro — stateful intelligence, deployed for you. © 2026.</p><p className="mt-1">© 2026 VargasJR LLC. All rights reserved.</p></footer>
    </main>
  );
}
