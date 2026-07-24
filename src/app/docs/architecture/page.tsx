import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";

export const metadata = {
  title: "Piro Inference Architecture",
  description: "The pseudocode contract for Piro's inference architecture.",
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

      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-amber-50 md:text-5xl">
            Piro Inference Architecture
          </h1>
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
          <div className="overflow-x-auto rounded-xl border border-amber-900/20 bg-[#0b0908] px-4 py-5 sm:px-6" role="region" aria-label="Piro inference pseudocode">
            <code className="block min-w-[40ch] font-mono text-sm leading-6 text-amber-100/85 sm:min-w-[42rem]">
              <div className="whitespace-pre"><Variable>weights</Variable> = <MethodLink href="/docs/architecture/loadWeights">LoadWeights</MethodLink>()</div>
              <div className="whitespace-pre"><Variable>x</Variable> = <MethodLink href="/docs/architecture/embedding">Embed</MethodLink>(<Link href="/docs/architecture/observation" className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 transition hover:text-violet-100">PiroInput</Link>)</div>
              <div className="whitespace-pre"><Variable>h₀</Variable> = <MethodLink href="/docs/architecture/initialize">InitializeOrRetrieveState</MethodLink>(<Variable>x</Variable>, <Variable>weights</Variable>)</div>
              <div className="whitespace-pre"><Keyword>for</Keyword> k = 0 ... Kmax:</div>
              <div className="h-3" aria-hidden="true" />
              <div className="whitespace-pre">    <Variable>contextₖ</Variable> = <MethodLink href="/docs/architecture/attention">Attention</MethodLink>(</div>
              <div className="whitespace-pre">        <Variable>hₖ</Variable>,</div>
              <div className="whitespace-pre">        <Variable>historyₖ</Variable>,</div>
              <div className="whitespace-pre">        <Variable>x</Variable>,</div>
              <div className="whitespace-pre">        k,</div>
              <div className="whitespace-pre">        <Variable>weights</Variable></div>
              <div className="whitespace-pre">    )</div>
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
              <div className="whitespace-pre">    <Variable>historyₖ₊₁</Variable> = <MethodLink href="/docs/architecture/history">UpdateHistory</MethodLink>(</div>
              <div className="whitespace-pre">        <Variable>historyₖ</Variable>,</div>
              <div className="whitespace-pre">        <Variable>hₖ₊₁</Variable>,</div>
              <div className="whitespace-pre">        <Variable>x</Variable>,</div>
              <div className="whitespace-pre">        k</div>
              <div className="whitespace-pre">    )</div>
              <div className="whitespace-pre">    <Keyword>if</Keyword> <MethodLink href="/docs/architecture/shouldHalt">ShouldHalt</MethodLink>(<Variable>hₖ₊₁</Variable>, k):</div>
              <div className="whitespace-pre">        <Variable>outputₖ</Variable> = <MethodLink href="/docs/architecture/output">OutputHead</MethodLink>(<Variable>hₖ₊₁</Variable>)</div>
              <div className="whitespace-pre">        <MethodLink href="/docs/architecture/plasticity">PlasticityController</MethodLink>(<Variable>hₖ₊₁</Variable>)</div>
              <div className="whitespace-pre">        <Keyword>return</Keyword> <Variable>outputₖ</Variable></div>
            </code>
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
