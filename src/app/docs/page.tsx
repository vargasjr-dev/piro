import Link from "next/link";
import DocsShell from "~/components/DocsShell";

export const metadata = {
  title: "Piro Docs — Stateful model infrastructure",
  description: "Build, train, and invoke small stateful models with Piro.",
};

const pillars = [
  ["Train", "Define the learning loop", "Bring your own sources, reward signals, and architecture. Piro turns experiments into repeatable training runs."],
  ["Deploy", "Keep the state", "Every model is an independently owned, mutable deployment — built to carry context forward instead of resetting between requests."],
  ["Measure", "Prove the claim", "Benchmarks are the contract. Compare architectures against falsifiable questions and ship only what the evidence supports."],
];

export default function DocsPage() {
  return (
    <DocsShell
      active="/docs"
      eyebrow="Piro platform documentation"
      title="Build models that keep becoming."
      description="Piro is the training and deployment layer for small, stateful models. Start with an experiment, grow it through reinforcement learning, and expose the result through a clean model API."
    >
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/12 via-[#17100b] to-[#100b08] p-7 shadow-[0_0_80px_rgba(249,115,22,0.08)] sm:p-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
          <p className="relative text-xs font-bold uppercase tracking-[0.22em] text-orange-300">The Piro thesis</p>
          <h2 className="relative mt-5 max-w-2xl text-3xl font-black leading-tight tracking-[-0.035em] text-amber-50 sm:text-5xl">
            RL is not the finishing step. It is the organizing principle.
          </h2>
          <p className="relative mt-6 max-w-2xl text-base leading-relaxed text-amber-200/65 sm:text-lg">
            The frontier stack starts with a giant static corpus and adds adaptation later. Piro starts smaller, keeps the model’s internal state visible, and uses learning signals to make intelligence compound around the person using it.
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-orange-200">Stateful by design</span>
            <span className="rounded-full border border-amber-700/40 px-4 py-2 font-mono text-amber-200/75">96 × 256M target</span>
            <span className="rounded-full border border-amber-700/40 px-4 py-2 text-amber-200/75">One H100 serving track</span>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-7 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400/60">Where to go next</p>
          <div className="mt-6 space-y-3">
            {[
              ["/docs/getting-started", "Getting started", "Create your first experiment and understand the repo contract."],
              ["/docs/api", "Invoke via API", "Send observations, continue state, and receive model output."],
              ["/docs/architecture", "Architecture", "Trace the state update loop from input to output."],
            ].map(([href, label, detail]) => (
              <Link key={href} href={href} className="group block rounded-2xl border border-amber-900/30 bg-amber-950/10 p-4 transition-colors hover:border-orange-500/40 hover:bg-orange-500/5">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-amber-50">{label}</span>
                  <span className="text-orange-300 transition-transform group-hover:translate-x-1">→</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-amber-300/55">{detail}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-16">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">The platform loop</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-amber-50 sm:text-4xl">From experiment to personal intelligence.</h2>
          <p className="mt-4 text-base leading-relaxed text-amber-200/60">Piro keeps the research loop and the serving loop connected. You can inspect what a model learned, benchmark the claim, and put the latest validated checkpoint behind an endpoint.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {pillars.map(([eyebrow, title, body]) => (
            <article key={eyebrow} className="rounded-2xl border border-amber-900/30 bg-[#13100c] p-6">
              <p className="text-4xl font-black text-orange-400/80">{eyebrow[0]}</p>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-orange-400">{eyebrow}</p>
              <h3 className="mt-2 text-xl font-bold text-amber-50">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-amber-300/55">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-amber-900/30 bg-[#0f0c09] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/60">The end state</p>
          <h2 className="mt-4 text-2xl font-bold text-amber-50">96 independent models. One H100.</h2>
          <p className="mt-4 text-sm leading-relaxed text-amber-300/60">Our planning target is 96 fully independent, continuously mutable 256M-parameter models resident on a single H100 80GB. The number is a memory-and-cost constraint first; throughput and update synchronization are benchmark questions.</p>
        </div>
        <div className="rounded-2xl border border-amber-900/30 bg-[#0f0c09] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/60">Docs-driven development</p>
          <h2 className="mt-4 text-2xl font-bold text-amber-50">The interface comes first.</h2>
          <p className="mt-4 text-sm leading-relaxed text-amber-300/60">The API and deployment language here describe the product we are building toward. Backend availability should not block the contract: write against the future you want to make real.</p>
        </div>
      </section>
    </DocsShell>
  );
}
