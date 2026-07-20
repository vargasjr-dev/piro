import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";
import StatefulArchitectureDiagram from "~/components/StatefulArchitectureDiagram";

export const metadata = {
  title: "Stateful RL-First Architecture — Piro",
  description: "The working architecture for Piro's stateful, RL-first model.",
};

const legend = [
  ["Implemented", "emerald"],
  ["Designed", "sky"],
  ["Learning", "orange"],
  ["Environment", "fuchsia"],
] as const;

export default function ArchitecturePage() {
  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 lg:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 hover:opacity-80 transition">
            <FlameLogo size={22} />
            <span className="hidden font-bold tracking-tight text-amber-50 sm:inline">Piro</span>
          </Link>
          <Link href="/docs" className="text-sm text-amber-400/60 transition hover:text-amber-100">
            Docs
          </Link>
          <span className="text-amber-900/50">/</span>
          <span className="text-sm font-medium text-amber-100">Architecture</span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">Working architecture · v0.1</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-amber-50 md:text-5xl">
            Stateful RL-first model
          </h1>
          <p className="mt-5 text-lg leading-8 text-amber-200/65">
            Piro should preserve what it expected, encounter the future, and let
            later consequences update the earlier decisions that actually earned
            credit.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {legend.map(([label, color]) => (
            <span key={label} className={`rounded-full border border-${color}-400/30 bg-${color}-400/[0.07] px-3 py-1.5 text-[10px] uppercase tracking-wider text-${color}-200`}>
              {label}
            </span>
          ))}
        </div>

        <section className="mt-10">
          <StatefulArchitectureDiagram />
        </section>

        <section className="mt-12 grid gap-5 lg:grid-cols-3">
          <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/70">Already here</p>
            <h2 className="mt-3 text-lg font-semibold text-amber-50">CTM thought ticks</h2>
            <p className="mt-2 text-sm leading-7 text-amber-200/60">
              Neuron state, history, synchronization-driven attention, and
              repeated internal ticks are the current research core.
            </p>
          </article>
          <article className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-sky-300/70">The design bet</p>
            <h2 className="mt-3 text-lg font-semibold text-amber-50">Future feedback</h2>
            <p className="mt-2 text-sm leading-7 text-amber-200/60">
              The environment does not need to grade every action immediately.
              Prediction records and eligibility traces keep earlier decisions
              open for later credit.
            </p>
          </article>
          <article className="rounded-2xl border border-orange-300/20 bg-orange-300/[0.04] p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-orange-200/70">The safety valve</p>
            <h2 className="mt-3 text-lg font-semibold text-amber-50">Consolidate slowly</h2>
            <p className="mt-2 text-sm leading-7 text-amber-200/60">
              Task-local adaptation can be fast. Durable weights should require
              replay, repeated evidence, and the ability to reject bad updates.
            </p>
          </article>
        </section>

        <section className="mt-12 rounded-2xl border border-amber-900/25 bg-amber-950/20 p-6 md:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/60">Next questions</p>
              <h2 className="mt-3 text-2xl font-semibold text-amber-50">What we should decide next</h2>
            </div>
            <Link href="/docs" className="text-sm text-orange-300 transition hover:text-orange-100">
              Read the docs →
            </Link>
          </div>
          <ol className="mt-6 grid gap-4 text-sm leading-7 text-amber-200/65 md:grid-cols-2">
            <li><span className="mr-2 font-mono text-orange-300">01</span> Should the first fast learner update policy state, a small adapter, or world-model memory?</li>
            <li><span className="mr-2 font-mono text-orange-300">02</span> Should belief and value state live inside the CTM tick loop or beside it?</li>
            <li><span className="mr-2 font-mono text-orange-300">03</span> What is the smallest environment that feels like a real Piro task?</li>
            <li><span className="mr-2 font-mono text-orange-300">04</span> What evidence is strong enough to promote an experience into durable learning?</li>
          </ol>
        </section>

        <div className="mt-12 border-t border-amber-900/20 pt-6">
          <Link href="/docs" className="text-sm text-amber-400/50 transition hover:text-amber-200">
            ← Back to docs
          </Link>
        </div>
      </div>
    </main>
  );
}
