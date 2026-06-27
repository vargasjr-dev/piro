"use client";

import { useState } from "react";
import FlameLogo from "~/components/FlameLogo";

const FEATURES = [
  { icon: "🏋️", label: "2 training runs per month", detail: "Full GPU training on your data" },
  { icon: "⚡️", label: "Unlimited inference", detail: "Query your trained model anytime" },
  { icon: "🤖", label: "Architecture Copilot", detail: "GLM 5.2–powered design assistant" },
  { icon: "📊", label: "Benchmark suite", detail: "Sanity, OOD Generalization, Adaptive Compute" },
  { icon: "🔑", label: "API key access", detail: "Use your model in your own apps" },
  { icon: "📦", label: "Model versioning", detail: "Roll back to any prior checkpoint" },
];

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0a08] flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-10">
        <FlameLogo size={28} />
        <span className="font-bold text-amber-50 text-xl tracking-tight">Piro</span>
      </div>

      <div className="w-full max-w-md">
        {/* Plan card */}
        <div className="rounded-2xl border border-amber-900/30 bg-[#13100c] p-8 shadow-xl">
          {/* Price */}
          <div className="text-center mb-8">
            <p className="text-amber-400/60 text-sm font-medium uppercase tracking-widest mb-2">Pro Plan</p>
            <div className="flex items-end justify-center gap-1">
              <span className="text-5xl font-bold text-amber-50">$100</span>
              <span className="text-amber-400/50 mb-2">/month</span>
            </div>
            <p className="text-amber-400/50 text-sm mt-2">
              Your own tiny ML model, trained on your data, getting smarter over time.
            </p>
          </div>

          {/* Features */}
          <ul className="space-y-3 mb-8">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-start gap-3">
                <span className="text-base mt-0.5">{f.icon}</span>
                <div>
                  <p className="text-sm text-amber-100 font-medium">{f.label}</p>
                  <p className="text-xs text-amber-400/40">{f.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Redirecting…" : "Subscribe — $100/mo"}
          </button>

          <p className="text-center text-xs text-amber-400/30 mt-4">
            Cancel anytime from your billing portal.
          </p>
        </div>
      </div>
    </div>
  );
}
