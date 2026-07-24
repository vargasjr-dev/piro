import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";

export const metadata = {
  title: "Docs — Piro",
  description: "Learn how Piro deploys stateful models and how its architecture carries continuity across inference.",
};

const workflow = [
  ["01", "Define the world", "Connect the repository, data, and experiment context your model should work inside."],
  ["02", "Deploy a state", "Piro initializes a working state for the model instead of treating every request as a blank slate."],
  ["03", "Infer and adapt", "Each invocation reads the state, reasons through the current input, and can update what comes next."],
];

const concepts = [
  ["Stateful inference", "Piro's core protocol", "Learn how observations, history, memory, and weights move through one completed inference."],
  ["Experiments", "How research ships", "Explore the repository convention for datasets, architectures, and benchmarks as the model track advances."],
  ["Deployment", "From research to use", "Understand the pieces behind a dedicated Piro model: state, weights, inference, and versioned checkpoints."],
];

export default function DocsPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#0d0a08] text-amber-100">
      <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight text-amber-50 transition-opacity hover:opacity-80">
            <FlameLogo size={28} />
            Piro
          </Link>
          <nav className="flex items-center gap-5 text-sm text-amber-300/70">
            <Link href="/" className="transition-colors hover:text-amber-100">Home</Link>
            <Link href="/pricing" className="transition-colors hover:text-amber-100">Pricing</Link>
          </nav>
        </div>
      </header>

      <section className="relative px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28">
        <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-orange-600/10 blur-3xl" />
        <div className="relative mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <div className="mb-7 flex w-fit items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              Piro documentation
            </div>
            <h1 className="text-5xl font-black leading-[0.98] tracking-[-0.045em] text-amber-50 sm:text-7xl">
              Give your model
              <span className="block bg-gradient-to-r from-orange-300 via-amber-200 to-red-500 bg-clip-text text-transparent ember-text-glow">
                somewhere to grow.
              </span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-amber-200/70 sm:text-xl">
              Piro is a framework and platform for deploying stateful intelligence. These docs explain the model contract, the experiment loop, and the path from a repository definition to a dedicated model that remembers its work.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link href="/docs/architecture" className="ember-glow rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-7 py-4 text-center text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500">
                Explore the architecture →
              </Link>
              <a href="#start" className="rounded-xl border border-amber-800/50 px-7 py-4 text-center text-base font-semibold text-amber-200 transition-colors hover:border-orange-400/70 hover:bg-orange-500/5">
                Start with the model loop
              </a>
            </div>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-3">
            {[
              ["STATE", "Persistent context across invocations"],
              ["RESEARCH", "Experiments that move the model forward"],
              ["DEPLOYMENT", "A dedicated model with versioned state"],
            ].map(([label, detail]) => (
              <div key={label} className="rounded-2xl border border-amber-900/40 bg-[#13100c]/80 p-5 backdrop-blur-sm">
                <p className="text-[10px] font-bold tracking-[0.2em] text-orange-400">{label}</p>
                <p className="mt-2 text-sm leading-relaxed text-amber-100/80">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="start" className="border-t border-amber-900/20 bg-[#0a0806] px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">The model loop</p>
            <h2 className="mt-5 text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">Inference is a continuation, not a reset.</h2>
            <p className="mt-6 text-lg leading-relaxed text-amber-200/65">A Piro model has somewhere to keep what it has learned. The important boundary is not just the prompt and response — it is the state that connects one invocation to the next.</p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {workflow.map(([number, title, body]) => (
              <article key={number} className="rounded-2xl border border-amber-900/35 bg-[#13100c] p-7 transition-colors hover:border-orange-500/40">
                <p className="text-4xl font-black text-orange-400/80">{number}</p>
                <h3 className="mt-8 text-xl font-bold text-amber-50">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-amber-300/60">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-amber-900/20 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.82fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">Read the contract</p>
            <h2 className="mt-5 text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">See exactly how state moves through Piro.</h2>
            <p className="mt-6 text-lg leading-relaxed text-amber-200/65">The architecture page is the technical center of gravity: pseudocode first, then the diagram, then a deeper contract for each transformation. Start there when you want to understand what a deployed Piro model actually does.</p>
            <Link href="/docs/architecture" className="mt-8 inline-flex items-center rounded-xl border border-orange-500/40 bg-orange-500/5 px-5 py-3.5 font-semibold text-orange-200 transition-colors hover:border-orange-300/70 hover:bg-orange-500/10">Open the stateful architecture →</Link>
          </div>
          <div className="relative rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-[#13100c] to-[#0d0a08] p-7 shadow-[0_0_80px_rgba(249,115,22,0.1)] sm:p-9">
            <div className="absolute right-6 top-6 rounded-full border border-emerald-400/30 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />pseudocode first</div>
            <p className="pt-8 text-xs font-bold uppercase tracking-[0.22em] text-amber-400/60">Stateful RL-first model</p>
            <div className="mt-6 space-y-3 font-mono text-sm text-amber-200/75">
              <p><span className="text-orange-400">01</span> load state + weights</p>
              <p><span className="text-orange-400">02</span> read observation and history</p>
              <p><span className="text-orange-400">03</span> compute the next state</p>
              <p><span className="text-orange-400">04</span> apply gated update</p>
              <p><span className="text-orange-400">05</span> persist plasticity</p>
            </div>
            <div className="mt-7 border-t border-amber-800/30 pt-5 text-sm leading-relaxed text-amber-300/55">Every line is a doorway into the full method contract.</div>
          </div>
        </div>
      </section>

      <section className="border-t border-amber-900/20 bg-[#0a0806] px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">Navigate Piro</p>
            <h2 className="mt-5 text-3xl font-bold text-amber-50 sm:text-5xl">Three ideas to keep in view.</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {concepts.map(([eyebrow, title, body]) => (
              <div key={title} className="rounded-2xl border border-amber-900/35 bg-[#13100c] p-7">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">{eyebrow}</p>
                <h3 className="mt-4 text-xl font-bold text-amber-50">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-amber-300/60">{body}</p>
                {title === "Stateful inference" && <Link href="/docs/architecture" className="mt-6 inline-block text-sm font-semibold text-orange-300 transition-colors hover:text-orange-100">Read the architecture →</Link>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-amber-900/20 px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">The docs explain the path<br /><span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">from state to intelligence.</span></h2>
          <p className="mt-6 text-lg leading-relaxed text-amber-200/65">When you are ready to see the implementation contract, continue into the architecture deep dive.</p>
          <Link href="/docs/architecture" className="ember-glow mt-9 inline-block rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-8 py-4 font-bold text-white transition-all hover:from-orange-400 hover:to-red-500">Open architecture docs →</Link>
          <div className="mt-12 flex justify-center"><FlameLogo size={40} /></div>
        </div>
      </section>

      <footer className="border-t border-amber-900/20 px-4 py-10 text-center text-xs text-amber-400/40"><p>Piro — stateful intelligence, deployed for you. © 2026.</p><p className="mt-1">© 2026 VargasJR LLC. All rights reserved.</p></footer>
    </main>
  );
}
