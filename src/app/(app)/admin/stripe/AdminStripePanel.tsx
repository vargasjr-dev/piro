"use client";

import { useState, useTransition } from "react";
import { verifyStripeConfig, bootstrapStripeProducts, type StripeConfigStatus } from "./actions";

export default function AdminStripePanel() {
  const [useTestMode, setUseTestMode] = useState(false);
  const [status, setStatus] = useState<StripeConfigStatus | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<{ success: boolean; message: string; priceId?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleVerify() {
    startTransition(async () => {
      setBootstrapResult(null);
      setStatus(await verifyStripeConfig(useTestMode));
    });
  }

  function handleBootstrap() {
    startTransition(async () => {
      setBootstrapResult(await bootstrapStripeProducts(useTestMode));
      setStatus(await verifyStripeConfig(useTestMode));
    });
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-900/30 bg-[#13100c] p-4">
        <label className="flex items-center gap-2 text-sm text-amber-100 cursor-pointer">
          <input
            type="checkbox"
            checked={useTestMode}
            onChange={(e) => setUseTestMode(e.target.checked)}
            className="accent-orange-500"
          />
          Use Stripe Test Mode
        </label>
        <span className="text-xs text-amber-400/50">
          {useTestMode ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleVerify}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 text-amber-100 text-sm font-medium transition disabled:opacity-60"
        >
          {isPending ? "Checking…" : "Verify Config"}
        </button>
        <button
          onClick={handleBootstrap}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold transition disabled:opacity-60"
        >
          {isPending ? "Bootstrapping…" : "Bootstrap Product & Price"}
        </button>
      </div>

      {/* Bootstrap result */}
      {bootstrapResult && (
        <div
          className={`rounded-xl border p-4 ${
            bootstrapResult.success
              ? "border-green-700/40 bg-green-900/20"
              : "border-red-700/40 bg-red-900/20"
          }`}
        >
          <p className="text-sm font-medium mb-1 text-amber-100">
            {bootstrapResult.success ? "✅ Success" : "❌ Failed"}
          </p>
          <p className="text-xs text-amber-400/70 font-mono break-all">{bootstrapResult.message}</p>
        </div>
      )}

      {/* Verify result */}
      {status && (
        <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-amber-100">
            {status.mode.toUpperCase()} mode — {status.connected ? "✅ Connected" : "❌ Not connected"}
          </h3>

          {status.error && (
            <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-3">
              <p className="text-xs text-red-200 font-mono">{status.error}</p>
            </div>
          )}

          {/* Product */}
          <div className="space-y-1">
            <p className="text-xs text-amber-400/50 uppercase tracking-widest">Product</p>
            {status.product.exists ? (
              <div className="text-sm">
                <p className="text-amber-100 font-medium">✅ {status.product.name}</p>
                <p className="text-xs text-amber-400/50 font-mono">{status.product.id}</p>
              </div>
            ) : (
              <p className="text-sm text-amber-400/60">❌ Not found — click Bootstrap to create it</p>
            )}
          </div>

          {/* Price */}
          <div className="space-y-1">
            <p className="text-xs text-amber-400/50 uppercase tracking-widest">Price ($100/mo)</p>
            {status.price.exists ? (
              <div className="text-sm">
                <p className="text-amber-100 font-medium">
                  ✅ ${status.price.amount! / 100}/{status.price.interval} ({status.price.currency?.toUpperCase()})
                </p>
                <p className="text-xs text-amber-400/50 font-mono">
                  {status.price.id} · lookup_key: {status.price.lookupKey}
                </p>
              </div>
            ) : (
              <p className="text-sm text-amber-400/60">❌ Not found — click Bootstrap to create it</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}