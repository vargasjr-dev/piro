import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";
import StatefulArchitectureDiagram from "~/components/StatefulArchitectureDiagram";

export const metadata = {
  title: "Stateful RL-First Architecture — Piro",
  description: "The working architecture for Piro's stateful, RL-first model.",
};

export default function ArchitecturePage() {
  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 lg:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 transition hover:opacity-80">
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
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">Piro architecture</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-amber-50 md:text-5xl">
            Stateful RL-first model
          </h1>
          <p className="mt-5 text-lg leading-8 text-amber-200/65">
            Piro is a multimodal, stateful CTM whose internal weights serve as memory
            and whose architecture includes the mechanism that updates those weights.
          </p>
        </div>

        <section className="mt-10">
          <StatefulArchitectureDiagram />
        </section>

        <p className="mt-5 text-center text-xs text-amber-400/45">
          Click any transformation node to open its zoomed-in diagram.
        </p>

        <section className="mt-10 rounded-2xl border border-amber-900/25 bg-[#100c0a] p-6 sm:p-8">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">Working pseudocode</p>
            <p className="mt-2 text-sm leading-6 text-amber-200/60">
              The pseudocode is intentionally shown below the diagram while we validate the recurrent flow one edge at a time.
            </p>
          </div>
          <pre className="overflow-x-auto whitespace-pre font-mono text-sm leading-7 text-amber-100/85"><code>{`x = Embed(PiroInput)

h₀ = InitializeOrRetrieveState(x, internal_weights)

for k = 0 ... Kmax:

    contextₖ = Attention(hₖ, historyₖ, x, weights)

    deltaₖ = Update(
        hₖ,
        x,
        contextₖ,
        historyₖ,
        weights
    )

    hₖ₊₁ = hₖ + gateₖ · deltaₖ

    historyₖ₊₁ = UpdateHistory(historyₖ, hₖ₊₁)

predictionₖ = PredictionHead(hₖ₊₁)
valueₖ      = ValueHead(hₖ₊₁)
outputₖ     = OutputHead(hₖ₊₁)
haltₖ       = HaltHead(hₖ₊₁, hₖ, predictionₖ)

if ShouldHalt(hₖ₊₁, haltₖ, k):
    return outputₖ`}</code></pre>
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
