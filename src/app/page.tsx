import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

export default async function HomePage() {
  // If a session cookie is present, send them straight to the app.
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token");

  if (hasSession) {
    redirect("/benchmarks");
  }

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
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
            <span className="text-amber-50">Frontier models are unaffordable.</span>
            <br />
            <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">
              We help you build your own.
            </span>
          </h1>

          <p className="text-amber-200/70 text-lg sm:text-xl mb-12 leading-relaxed max-w-2xl mx-auto">
            Train a tiny ML model on your data for{" "}
            <span className="text-orange-400 font-semibold">$100/mo</span>. Keep it forever.
            Query it as much as you want. No per-token tax.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
          </div>

          <p className="text-amber-400/40 text-sm mt-6">
            2 training runs per month · unlimited inference · cancel anytime
          </p>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-amber-400/40 animate-bounce text-xs">
          ↓
        </div>
      </section>

      {/* ── THE MATH IS BROKEN ────────────────────────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20">
        <div className="max-w-4xl mx-auto">
          <p className="text-orange-400/80 text-sm font-semibold uppercase tracking-widest mb-4">
            The math is broken
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-12 leading-tight">
            You can't afford to use what you pay for.
          </h2>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <p className="text-4xl font-black text-amber-50 mb-2">$20</p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                minimum / month to access a frontier model. That's the cheap tier — no API credits, no real usage.
              </p>
            </div>
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <p className="text-4xl font-black text-amber-50 mb-2">$0.015</p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                per 1K tokens on the OpenAI API. A 50-message conversation is $5–$10 in tokens alone.
              </p>
            </div>
            <div className="rounded-xl border border-red-700/40 bg-red-900/10 p-6">
              <p className="text-4xl font-black text-red-300 mb-2">$200+</p>
              <p className="text-sm text-amber-200/70 leading-relaxed">
                real monthly cost for a person who actually uses a frontier model. And you don't own anything.
              </p>
            </div>
          </div>

          <p className="text-lg text-amber-200/80 leading-relaxed max-w-2xl">
            Every query is a tax. You pay the API, you pay the subscription, and
            the provider owns the model — so they can raise prices, throttle you,
            or shut you out whenever they want. The bill grows with your usage.
            Your leverage shrinks.
          </p>
        </div>
      </section>

      {/* ── OPEN SOURCE FRONTIER DOESN'T EXIST ───────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20 bg-[#0a0806]">
        <div className="max-w-4xl mx-auto">
          <p className="text-orange-400/80 text-sm font-semibold uppercase tracking-widest mb-4">
            The uncomfortable truth
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-12 leading-tight">
            There is no open-source frontier model.
          </h2>

          <div className="space-y-6 text-lg text-amber-200/80 leading-relaxed max-w-3xl">
            <p>
              The open-weight models — Llama, Qwen, DeepSeek, Mistral — are{" "}
              <span className="text-amber-50 font-semibold">good</span>.
              But they are not frontier. Every benchmark, every leaderboard: the
              closed frontier labs are six months ahead and the gap is widening.
            </p>

            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6 my-8">
              <p className="text-base text-amber-200/90 font-medium mb-3">
                Even when you can run an "open" model:
              </p>
              <ul className="space-y-2 text-sm text-amber-400/70">
                <li className="flex gap-3">
                  <span className="text-orange-400 shrink-0">→</span>
                  Llama 405B needs <span className="text-amber-50">$300/hr</span> of H100 capacity to serve one request
                </li>
                <li className="flex gap-3">
                  <span className="text-orange-400 shrink-0">→</span>
                  "Free" weights still cost{" "}
                  <span className="text-amber-50">$5K–$50K</span> in GPUs to fine-tune
                </li>
                <li className="flex gap-3">
                  <span className="text-orange-400 shrink-0">→</span>
                  Self-hosting at home means{" "}
                  <span className="text-amber-50">4-figure hardware</span> and an electrician
                </li>
              </ul>
            </div>

            <p>
              The "open-source frontier" pitch is a lie. The weights are open. The
              cost of running them is not.
            </p>
          </div>
        </div>
      </section>

      {/* ── WHAT IF WE ALL BUILT OUR OWN ─────────────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20">
        <div className="max-w-4xl mx-auto">
          <p className="text-orange-400/80 text-sm font-semibold uppercase tracking-widest mb-4">
            The bet
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-12 leading-tight">
            What if we all built our own?
          </h2>

          <div className="space-y-6 text-lg text-amber-200/80 leading-relaxed max-w-3xl">
            <p>
              Small models trained on{" "}
              <span className="text-amber-50 font-semibold">your data</span> for{" "}
              <span className="text-amber-50 font-semibold">your tasks</span> have
              caught up to frontier reasoning on narrow domains. A 10M-parameter
              model that's seen your codebase, your notes, your emails — it
              knows things a 405B-parameter model never will.
            </p>

            <p>
              The frontier labs have a billion users and one model.{" "}
              <span className="text-amber-50 font-semibold">We have one user and one model each.</span>{" "}
              That's not a disadvantage — it's a moat.
            </p>

            <p>
              Piro is the ecosystem for this. Train your own tiny model. Keep it.
              Query it forever. When the frontier raises prices, your model is
              already trained.
            </p>
          </div>

          {/* How it works */}
          <div className="grid sm:grid-cols-3 gap-6 mt-16">
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <div className="text-3xl font-black text-orange-400 mb-3">1</div>
              <p className="text-base font-semibold text-amber-50 mb-2">Connect your data</p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                GitHub repos, Gmail, Notion, anything text. Piro trains on the corpus you choose.
              </p>
            </div>
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <div className="text-3xl font-black text-orange-400 mb-3">2</div>
              <p className="text-base font-semibold text-amber-50 mb-2">Train your model</p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                Two runs per month. We run the GPUs. You keep the weights — checkpointed and versioned.
              </p>
            </div>
            <div className="rounded-xl border border-amber-900/30 bg-[#13100c] p-6">
              <div className="text-3xl font-black text-orange-400 mb-3">3</div>
              <p className="text-base font-semibold text-amber-50 mb-2">Query it forever</p>
              <p className="text-sm text-amber-400/60 leading-relaxed">
                Unlimited inference. Your model, your API, your cost — fixed at $100/mo regardless of usage.
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
                ["🏋️", "2 training runs / month", "Full GPU training on your data"],
                ["⚡️", "Unlimited inference", "Query your trained model anytime"],
                ["🤖", "Architecture Copilot (GLM 5.2)", "Design help for your model classes"],
                ["📊", "Benchmark suite", "Sanity, generalization, adaptive compute"],
                ["📦", "Model versioning", "Roll back to any prior checkpoint"],
                ["🔑", "API access", "Use your model in your own apps"],
              ].map(([icon, label, detail]) => (
                <li key={label} className="flex items-start gap-3 py-2">
                  <span className="text-lg mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm text-amber-100 font-medium">{label}</p>
                    <p className="text-xs text-amber-400/50">{detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="block text-center w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-500 transition-all ember-glow text-base"
            >
              Build your model — start training →
            </Link>
          </div>

          <p className="text-center text-amber-400/50 text-sm">
            Cancel anytime from your billing portal. No commitment. No per-token tax.
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32 px-4 border-t border-amber-900/20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-bold text-amber-50 mb-6 leading-tight">
            The frontier is closed.
            <br />
            <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">
              Build your own.
            </span>
          </h2>

          <p className="text-amber-200/70 text-lg mb-10 leading-relaxed">
            Join the people building an ecosystem of tiny, owned, personal models —
            one user at a time.
          </p>

          <Link
            href="/signup"
            className="inline-block px-10 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:red-500 transition-all ember-glow text-base"
          >
            Start training your model →
          </Link>

          <div className="mt-12 flex justify-center">
            <FlameLogo size={40} />
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="py-10 px-4 border-t border-amber-900/20 text-center text-amber-400/40 text-xs">
        <p>
          Piro — tiny ML, owned forever. © 2026.
        </p>
      </footer>
    </main>
  );
}