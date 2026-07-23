import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";

export const metadata = {
  title: "Stateful RL-First Architecture — Piro",
  description: "The pseudocode contract for Piro's stateful, RL-first model.",
};

type MethodLinkProps = {
  href: string;
  children: string;
};

function MethodLink({ href, children }: MethodLinkProps) {
  return (
    <Link
      href={href}
      className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition hover:text-emerald-100 hover:decoration-emerald-200"
    >
      {children}
    </Link>
  );
}

function Variable({ children }: { children: string }) {
  return <span className="text-sky-200/90">{children}</span>;
}

function Keyword({ children }: { children: string }) {
  return <span className="text-orange-300">{children}</span>;
}

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

      <div className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
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

        <div className="mt-10 flex items-center gap-1 border-b border-amber-900/30" role="tablist" aria-label="Architecture views">
          <div
            className="border-b-2 border-orange-300 px-4 py-3 text-sm font-semibold text-amber-50"
            role="tab"
            aria-selected="true"
          >
            Pseudocode
          </div>
          <div
            className="cursor-not-allowed px-4 py-3 text-sm text-amber-400/35"
            title="The diagram view will return as a secondary view later."
            role="tab"
            aria-selected="false"
            aria-disabled="true"
          >
            Diagram <span className="ml-1 text-xs">(later)</span>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-amber-900/25 bg-[#100c0a] p-6 shadow-2xl shadow-black/10 sm:p-8">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">Top-level contract</p>
              <h2 className="mt-2 text-2xl font-semibold text-amber-50">Piro inference loop</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-right text-amber-200/55">
              Follow any linked method to open its nested architecture page.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-amber-900/20 bg-[#0b0908] px-4 py-5 sm:px-6" role="region" aria-label="Piro top-level pseudocode">
            <code className="block min-w-[40ch] font-mono text-sm leading-6 text-amber-100/85 sm:min-w-[42rem] sm:text-[0.95rem]">
              <div className="whitespace-pre"><Variable>weights</Variable> = <MethodLink href="/docs/architecture/loadWeights">LoadWeights</MethodLink>()</div>
              <div className="whitespace-pre"><Variable>x</Variable> = <MethodLink href="/docs/architecture/embedding">Embed</MethodLink>(<Link href="/docs/architecture/observation" className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 transition hover:text-violet-100">PiroInput</Link>)</div>
              <div className="whitespace-pre"><Variable>h₀</Variable> = <MethodLink href="/docs/architecture/initialize">InitializeOrRetrieveState</MethodLink>(<Variable>x</Variable>, <Variable>weights</Variable>)</div>
              <div className="whitespace-pre"><Keyword>for</Keyword> k = 0 ... Kmax:</div>
              <div className="h-3" aria-hidden="true" />
              <div className="whitespace-pre">    <Variable>contextₖ</Variable> = <MethodLink href="/docs/architecture/attention">Attention</MethodLink>(<Variable>hₖ</Variable>, <Variable>historyₖ</Variable>, <Variable>x</Variable>, <Variable>weights</Variable>)</div>
              <div className="h-3" aria-hidden="true" />
              <div className="whitespace-pre">    <Variable>deltaₖ</Variable> = <MethodLink href="/docs/architecture/delta">ComputeStateDelta</MethodLink>(</div>
              <div className="whitespace-pre">        <Variable>hₖ</Variable>,</div>
              <div className="whitespace-pre">        <Variable>x</Variable>,</div>
              <div className="whitespace-pre">        <Variable>contextₖ</Variable>,</div>
              <div className="whitespace-pre">        <Variable>historyₖ</Variable>,</div>
              <div className="whitespace-pre">        <Variable>weights</Variable></div>
              <div className="whitespace-pre">    )</div>
              <div className="h-3" aria-hidden="true" />
              <div className="whitespace-pre">    <Variable>hₖ₊₁</Variable> = <MethodLink href="/docs/architecture/residual">ApplyGatedStateUpdate</MethodLink>(<Variable>hₖ</Variable>, <Variable>gateₖ</Variable>, <Variable>deltaₖ</Variable>)</div>
              <div className="whitespace-pre">    <Variable>historyₖ₊₁</Variable> = <MethodLink href="/docs/architecture/history">UpdateHistory</MethodLink>(<Variable>historyₖ</Variable>, <Variable>hₖ₊₁</Variable>)</div>
              <div className="whitespace-pre">    <Keyword>if</Keyword> <MethodLink href="/docs/architecture/shouldHalt">ShouldHalt</MethodLink>(<Variable>hₖ₊₁</Variable>, k):</div>
              <div className="whitespace-pre">        <Variable>outputₖ</Variable> = <MethodLink href="/docs/architecture/output">OutputHead</MethodLink>(<Variable>hₖ₊₁</Variable>)</div>
              <div className="whitespace-pre">        <MethodLink href="/docs/architecture/plasticity">PlasticityController</MethodLink>(<Variable>hₖ₊₁</Variable>)</div>
              <div className="whitespace-pre">        <Keyword>return</Keyword> <Variable>outputₖ</Variable></div>
            </code>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-amber-900/25 bg-[#100c0a] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">How to read this</p>
            <p className="mt-3 text-sm leading-7 text-amber-200/65">
              The method names are the architecture. The values passed between them
              make state, history, inputs, learning signals, and updated weights
              explicit without requiring a separate graph to decode the flow.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-900/25 bg-[#100c0a] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">Nested detail</p>
            <p className="mt-3 text-sm leading-7 text-amber-200/65">
              Each linked method opens the deeper contract for that transformation.
              Plasticity runs before every completed inference returns. Nested
              pages expose the same pseudocode-first/diagram-second tabs.
            </p>
          </div>
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
