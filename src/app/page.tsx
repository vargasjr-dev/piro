import Link from "next/link";
import { cookies } from "next/headers";
import FlameLogo from "~/components/FlameLogo";

export default async function HomePage() {
  // Check if the user is logged in so we can swap the CTAs.
  // We do NOT redirect — logged-in users can still view the landing page.
  const cookieStore = await cookies();
  const isLoggedIn =
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token");

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      {/* Public navigation — Docs belongs here, not in the authenticated dashboard. */}
      <header className="absolute top-0 inset-x-0 z-20 border-b border-amber-900/20 bg-[#0d0a08]/70 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition">
            <FlameLogo size={24} />
            <span className="font-bold text-amber-50 tracking-tight">Piro</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/docs" className="text-amber-300/60 hover:text-amber-100 transition-colors">
              Docs
            </Link>
            {isLoggedIn ? (
              <Link href="/repos" className="text-amber-300/60 hover:text-amber-100 transition-colors">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="text-amber-300/60 hover:text-amber-100 transition-colors">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 text-center max-w-3xl">
          <div className="mb-8 flex justify-center">
            <FlameLogo size={72} />
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-6 leading-[1.05]">
            <span className="text-amber-50">
              Open weights are not enough.
            </span>
            <br />
            <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">
              Build your own model.
            </span>
          </h1>

          <p className="text-amber-200/70 text-lg sm:text-xl mb-12 leading-relaxed max-w-2xl mx-auto">
            Train your own ML Model using{" "}
            <span className="text-orange-400 font-semibold">
              your own data and benchmarks
            </span>
            . Join the community actively looking for the cheaper and{" "}
            <span className="text-orange-400 font-semibold">
              memory-enabled successor to the transformer
            </span>
            .
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isLoggedIn ? (
              <Link
                href="/repos"
                className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-500 transition-all ember-glow text-base"
              >
                Go To Models →
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-500 transition-all ember-glow text-base"
                >
                  Build your model — $100/mo
                </Link>
                <Link
                  href="/login"
                  className="px-8 py-3.5 border border-amber-900/50 text-amber-200 font-semibold rounded-xl hover:border-orange-500/50 hover:text-amber-50 transition-all text-base"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>

          {!isLoggedIn && (
            <p className="text-amber-400/40 text-sm mt-6">
              2 training runs per month · unlimited inference · cancel anytime
            </p>
          )}
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-amber-400/40 animate-bounce text-xs">
          ↓
        </div>
      </section>

      {/* ── OPEN WEIGHTS ≠ OPEN SOURCE ──────────────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20">
        <div className="max-w-4xl mx-auto">
          <p className="text-orange-400/80 text-sm font-semibold uppercase tracking-widest mb-4">
            The distinction
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-12 leading-tight">
            Open weights are not open source.
          </h2>

          <div className="space-y-6 text-lg text-amber-200/80 leading-relaxed max-w-3xl">
            <p>
              The open-weight models — Llama, Qwen, DeepSeek, Mistral — are{" "}
              <span className="text-amber-50 font-semibold">genuinely good</span>.
              You can download them, run them locally, and fine-tune them. That's
              real progress, and we celebrate it.
            </p>

            <p>
              But free weights give you{" "}
              <span className="text-amber-50 font-semibold">inference</span>, not{" "}
              <span className="text-amber-50 font-semibold">agency</span>. You
              can't retrain the model from scratch. You can't change the
              architecture. You can't swap the attention mechanism for something
              with memory. You're renting a pre-built brain and customizing the
              furniture.
            </p>

            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6 my-8">
              <p className="text-base text-amber-200/90 font-medium mb-3">
                Open source means you control the full pipeline:
              </p>
              <ul className="space-y-2 text-sm text-amber-400/70">
                <li className="flex gap-3">
                  <span className="text-orange-400 shrink-0">→</span>
                  The <span className="text-amber-50">architecture</span> — not
                  just the weights, the design of the model itself
                </li>
                <li className="flex gap-3">
                  <span className="text-orange-400 shrink-0">→</span>
                  The <span className="text-amber-50">training pipeline</span> —
                  how it learns, what it learns on, how it improves
                </li>
                <li className="flex gap-3">
                  <span className="text-orange-400 shrink-0">→</span>
                  The <span className="text-amber-50">data</span> — your corpus,
                  your domain, not a generic internet scrape
                </li>
                <li className="flex gap-3">
                  <span className="text-orange-400 shrink-0">→</span>
                  The <span className="text-amber-50">weights</span> — yours to
                  keep, version, and deploy anywhere
                </li>
              </ul>
            </div>

            <p>
              That's what Piro gives you. Not a model to download — a{" "}
              <span className="text-amber-50 font-semibold">model to build</span>.
            </p>
          </div>
        </div>
      </section>

      {/* ── WHAT PIRO IS ────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20 bg-[#0a0806]">
        <div className="max-w-4xl mx-auto">
          <p className="text-orange-400/80 text-sm font-semibold uppercase tracking-widest mb-4">
            What Piro is
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-12 leading-tight">
            The platform to train your own model.
          </h2>

          <div className="space-y-6 text-lg text-amber-200/80 leading-relaxed max-w-3xl">
            <p>
              Piro trains a{" "}
              <span className="text-amber-50 font-semibold">tiny model</span> —
              ~10M parameters — on{" "}
              <span className="text-amber-50 font-semibold">your data</span>,
              against{" "}
              <span className="text-amber-50 font-semibold">your benchmarks</span>.
              Not a fine-tune of someone else's model. A model trained from
              scratch, on your terms, that you own completely.
            </p>

            <p>
              The architecture is a{" "}
              <span className="text-amber-50 font-semibold">
                Continuous Thought Machine
              </span>{" "}
              — a memory-enabled successor to the transformer. Instead of
              processing tokens in a single pass, it thinks in bursts: refining,
              recalling, and adjusting across multiple cycles. It's the research
              frontier for models that reason, not just predict.
            </p>

            <p>
              You keep the weights. Query them forever. No per-token tax, no API
              dependency, no one can take it away.
            </p>
          </div>

          {/* How it works */}
          <div className="grid sm:grid-cols-3 gap-6 mt-16">
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <div className="text-3xl font-black text-orange-400 mb-3">1</div>
              <p className="text-base font-semibold text-amber-50 mb-2">
                Connect your data
              </p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                GitHub repos, Gmail, Notion, anything text. Piro trains on the
                corpus you choose.
              </p>
            </div>
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <div className="text-3xl font-black text-orange-400 mb-3">2</div>
              <p className="text-base font-semibold text-amber-50 mb-2">
                Train your model
              </p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                We run the GPUs. You keep the weights — checkpointed and
                versioned.
              </p>
            </div>
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <div className="text-3xl font-black text-orange-400 mb-3">3</div>
              <p className="text-base font-semibold text-amber-50 mb-2">
                Query it forever
              </p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                Unlimited inference. Your model, your API, your cost — fixed
                regardless of usage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING + WHAT YOU GET ──────────────────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20 bg-[#0a0806]">
        <div className="max-w-3xl mx-auto">
          <p className="text-orange-400/80 text-sm font-semibold uppercase tracking-widest mb-4 text-center">
            Pro plan
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-12 leading-tight text-center">
            One plan. One price. No surprises.
          </h2>

          <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-b from-orange-500/5 to-transparent p-8 sm:p-10 mb-10">
            <div className="text-center mb-8">
              <div className="flex items-end justify-center gap-1 mb-2">
                <span className="text-6xl font-black text-amber-50">$100</span>
                <span className="text-amber-400/50 mb-3">/month</span>
              </div>
              <p className="text-amber-400/60 text-sm">
                Less than one week of a frontier API habit.
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {[
                [
                  "🏋️",
                  "2 training runs / month",
                  "Full GPU training on your data",
                ],
                [
                  "⚡️",
                  "Unlimited inference",
                  "Query your trained model anytime",
                ],
                [
                  "🤖",
                  "Architecture Copilot (GLM 5.2)",
                  "Design help for your model classes",
                ],
                [
                  "📊",
                  "Benchmark suite",
                  "Sanity, generalization, adaptive compute",
                ],
                ["📦", "Model versioning", "Roll back to any prior checkpoint"],
                ["🔑", "API access", "Use your model in your own apps"],
              ].map(([icon, label, detail]) => (
                <li key={label} className="flex items-start gap-3 py-2">
                  <span className="text-lg mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm text-amber-100 font-medium">
                      {label}
                    </p>
                    <p className="text-xs text-amber-400/50">{detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href={isLoggedIn ? "/repos" : "/signup"}
              className="block text-center w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-500 transition-all ember-glow text-base"
            >
              {isLoggedIn ? "Go To Models →" : "Build your model — start training →"}
            </Link>
          </div>

          <p className="text-center text-amber-400/50 text-sm">
            Cancel anytime from your billing portal. No commitment. No per-token
            tax.
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-6 leading-tight">
            Stop renting intelligence.
            <br />
            <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">
              Build your own.
            </span>
          </h2>

          <p className="text-amber-200/70 text-lg mb-10 leading-relaxed">
            Join the community training tiny, owned models on their own data —
            and exploring what comes after the transformer.
          </p>

          <Link
            href={isLoggedIn ? "/repos" : "/signup"}
            className="inline-block px-10 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:red-500 transition-all ember-glow text-base"
          >
            {isLoggedIn ? "Go To Models →" : "Start training your model →"}
          </Link>

          <div className="mt-12 flex justify-center">
            <FlameLogo size={40} />
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="py-10 px-4 border-t border-amber-900/20 text-center text-amber-400/40 text-xs">
        <p>Piro — tiny ML, owned forever. © 2026.</p>
        <p className="mt-1">© 2026 VargasJR LLC. All rights reserved.</p>
      </footer>
    </main>
  );
}
