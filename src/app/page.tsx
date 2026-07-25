import Link from "next/link";
import { cookies } from "next/headers";
import FlameLogo from "~/components/FlameLogo";
import PublicNavbar from "~/components/PublicNavbar";
import { getLatestPiroModel } from "~/lib/latest-experiment";

export default async function HomePage() {
  const cookieStore = await cookies();
  const isLoggedIn =
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token");
  const latestModel = getLatestPiroModel();

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <PublicNavbar isLoggedIn={isLoggedIn} />

      <section className="relative overflow-hidden px-4 pb-24 pt-16 sm:px-6 sm:pb-32 sm:pt-24">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-orange-600/10 blur-3xl" />
        <div className="relative mx-auto max-w-5xl text-center">
          <div className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
            Stateful intelligence, deployed for you
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] text-amber-50 sm:text-7xl lg:text-8xl">
            Your model should
            <span className="block bg-gradient-to-r from-orange-300 via-amber-200 to-red-500 bg-clip-text text-transparent ember-text-glow">
              remember you.
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-amber-200/70 sm:text-xl">
            Piro is a stateful model that carries context across invocations — not a stateless chat window that forgets you between requests. Deploy your own dedicated instance, then let it grow with your work.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href={isLoggedIn ? "/repos" : "/signup"} className="ember-glow rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-8 py-4 text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500">
              {isLoggedIn ? "Open your model →" : "Deploy your model →"}
            </Link>
            <Link href="#how-it-works" className="rounded-xl border border-amber-800/50 px-8 py-4 text-base font-semibold text-amber-200 transition-colors hover:border-amber-500/70 hover:bg-amber-500/5">
              See how it works
            </Link>
          </div>
          <div className="mx-auto mt-14 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            {[
              ["STATEFUL", "Memory that survives the request"],
              ["DEDICATED", "A model instance that is yours"],
              ["CURRENT", `${latestModel.label} · always updated`],
            ].map(([eyebrow, detail]) => (
              <div key={eyebrow} className="rounded-2xl border border-amber-900/40 bg-[#13100c]/80 p-4 backdrop-blur-sm">
                <p className="text-[10px] font-bold tracking-[0.2em] text-orange-400">{eyebrow}</p>
                <p className="mt-2 text-sm leading-relaxed text-amber-100/80">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-amber-900/20 bg-[#0a0806] px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-orange-400">The difference</p>
            <h2 className="text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">Not another API key.<br /><span className="text-orange-300">A model with continuity.</span></h2>
            <p className="mt-6 text-lg leading-relaxed text-amber-200/65">Frontier chat APIs are optimized for disposable conversations. Piro is built around the part that matters after the first prompt: a persistent internal state that can be updated, queried, checkpointed, and improved.</p>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {[
              ["01", "Start with a working state", "Every invocation begins with the state your model has already accumulated — your context, your patterns, your history."],
              ["02", "Let it adapt", "Piro updates its state as it works. The model can carry forward what it learned instead of re-reading the same world from scratch."],
              ["03", "Keep the deployment", "Your dedicated model is versioned and addressable. Move from experiment to useful personal intelligence without rebuilding the relationship each time."],
            ].map(([number, title, body]) => (
              <article key={number} className="group rounded-2xl border border-amber-900/35 bg-[#13100c] p-7 transition-colors hover:border-orange-500/40">
                <p className="text-4xl font-black text-orange-400/80 transition-colors group-hover:text-orange-300">{number}</p>
                <h3 className="mt-8 text-xl font-bold text-amber-50">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-amber-300/60">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-amber-900/20 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_0.82fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-orange-400">Always current</p>
            <h2 className="max-w-xl text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">Your deployment follows the frontier.</h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-amber-200/65">Piro’s research moves through named experiments. When a new architecture becomes the latest validated model, the hosted starting point changes with it — no stale model name hardcoded into the promise.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-200">Latest experiment: {latestModel.experiment}</span>
              <span className="rounded-full border border-amber-700/40 px-4 py-2 font-mono text-sm text-amber-300/80">{latestModel.architecture}</span>
            </div>
          </div>
          <div className="relative rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-[#13100c] to-[#0d0a08] p-7 shadow-[0_0_80px_rgba(249,115,22,0.12)] sm:p-10">
            <div className="absolute right-6 top-6 flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> live model track</div>
            <p className="pt-8 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/60">The current Piro model</p>
            <p className="mt-5 text-4xl font-black tracking-tight text-amber-50 sm:text-5xl">{latestModel.label}</p>
            <div className="mt-8 border-t border-amber-800/30 pt-6 text-sm text-amber-200/65">
              <div className="flex justify-between gap-4 py-2"><span>State</span><span className="font-semibold text-emerald-300">Persistent</span></div>
              <div className="flex justify-between gap-4 py-2"><span>Deployment</span><span className="font-semibold text-amber-100">Dedicated</span></div>
              <div className="flex justify-between gap-4 py-2"><span>Model selection</span><span className="font-semibold text-amber-100">Dynamic</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-amber-900/20 bg-[#0a0806] px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-orange-400">Piro · $100/month</p>
            <h2 className="text-3xl font-bold text-amber-50 sm:text-5xl">One dedicated model. One predictable price.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-amber-200/65">The subscription buys inference on the latest Piro model, deployed as your own stateful instance. As the research advances, your model track advances with it.</p>
          </div>
          <div className="rounded-3xl border border-orange-500/35 bg-gradient-to-b from-orange-500/10 to-transparent p-8 sm:p-12">
            <div className="grid gap-10 md:grid-cols-[0.8fr_1fr] md:items-center">
              <div><div className="flex items-end gap-2"><span className="text-6xl font-black text-amber-50">$100</span><span className="mb-3 text-amber-400/60">/month</span></div><p className="mt-4 text-sm leading-relaxed text-amber-300/60">Inference access to <span className="font-semibold text-orange-200">{latestModel.label}</span>, resolved from the latest experiment.</p></div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Dedicated state", "Your model’s working state persists between calls."],
                  ["Latest model track", "Automatically points at the newest validated experiment."],
                  ["Unlimited inference", "Use the model without a per-token meter."],
                  ["Versioned checkpoints", "Inspect and recover the state that powers your deployment."],
                  ["API access", "Connect your model to the tools and workflows you already use."],
                  ["Research-grade evals", "See how the model behaves as Piro keeps improving."],
                ].map(([title, detail]) => <li key={title} className="border-l border-orange-400/50 pl-4"><p className="text-sm font-semibold text-amber-50">{title}</p><p className="mt-1 text-xs leading-relaxed text-amber-300/55">{detail}</p></li>)}
              </ul>
            </div>
            <Link href="/pricing" className="mt-10 block rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4 text-center text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500 ember-glow">Deploy the latest Piro model →</Link>
          </div>
          <p className="mt-6 text-center text-sm text-amber-400/50">Cancel anytime. The model is yours to use while your subscription is active.</p>
        </div>
      </section>

      <section className="border-t border-amber-900/20 px-4 py-24 text-center sm:px-6 sm:py-32">
        <div className="mx-auto max-w-2xl"><h2 className="text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">Give your intelligence<br /><span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">somewhere to grow.</span></h2><p className="mt-6 text-lg leading-relaxed text-amber-200/65">Deploy a stateful Piro model built on the latest experiment — and stop starting from zero.</p><Link href={isLoggedIn ? "/repos" : "/signup"} className="ember-glow mt-10 inline-block rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-10 py-4 text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500">{isLoggedIn ? "Open your model →" : "Deploy your model →"}</Link><div className="mt-12 flex justify-center"><FlameLogo size={40} /></div></div>
      </section>

      <footer className="border-t border-amber-900/20 px-4 py-10 text-center text-xs text-amber-400/40"><p>Piro — stateful intelligence, deployed for you. © 2026.</p><p className="mt-1">© 2026 VargasJR LLC. All rights reserved.</p></footer>
    </main>
  );
}
