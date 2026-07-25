import Link from "next/link";
import DocsShell from "~/components/DocsShell";

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

export const metadata = {
  title: "Architecture — Piro Docs",
  description: "Understand the fast-state and durable-weight inference architecture behind Piro.",
};

export default function ArchitecturePage() {
  return (
    <DocsShell
      active="/docs/architecture"
      eyebrow="One tab in the platform"
      title="Architecture is the beginning, not the whole product."
      description="Piro separates durable model knowledge from fast run state. This is the technical view of the model loop; API and state-store identity live in the surrounding serving adapter."
    >
      <div className="grid gap-5 lg:grid-cols-[0.76fr_1.24fr]">
        <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-[#13100c] p-7 sm:p-9">
          <h2 className="mt-4 text-2xl font-bold text-amber-50">Fast state. Durable weights.</h2>
          <p className="mt-4 text-sm leading-relaxed text-amber-300/60">
            A Piro invocation can adapt quickly without forcing every observation into durable model knowledge. The model returns updated fast state as a value; a serving adapter may persist that value under an application-level state key.
          </p>
          <div className="mt-7 space-y-3 text-sm">
            {["Load durable weights", "Initialize fast state", "Adapt across observations", "Persist by policy"].map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-xl border border-amber-900/25 bg-amber-950/15 p-3">
                <span className="font-mono text-xs text-orange-300">0{index + 1}</span>
                <span className="text-amber-200/75">{step}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#100c0a] p-6 shadow-2xl shadow-black/10 sm:p-8">
          <div className="overflow-x-auto rounded-2xl border border-amber-900/20 bg-[#0b0908] px-4 py-5 sm:px-6" role="region" aria-label="Piro inference pseudocode">
            <code className="block min-w-[48rem] font-mono text-sm leading-6 text-amber-100/85">
              <div className="whitespace-pre"><Variable>durableWeights</Variable> = <MethodLink href="/docs/architecture/loadWeights">LoadWeights</MethodLink>()</div>
              <div className="whitespace-pre"><Variable>fastState</Variable> = <MethodLink href="/docs/architecture/initializeFastState">InitializeFastState</MethodLink>(<Variable>durableWeights</Variable>)</div>
              <div className="whitespace-pre"><Variable>x</Variable> = <MethodLink href="/docs/architecture/embedding">Embed</MethodLink>(<Link href="/docs/architecture/observation" className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 transition hover:text-violet-100">PiroInput</Link>)</div>
              <div className="whitespace-pre"><Variable>runtimeWeights</Variable> = <MethodLink href="/docs/architecture/bindFastState">BindFastState</MethodLink>(<Variable>durableWeights</Variable>, <Variable>fastState</Variable>)</div>
              <div className="whitespace-pre"><Variable>output</Variable> = []</div>
              <div className="whitespace-pre"><Keyword>for</Keyword> each observedChunk in <MethodLink href="/docs/architecture/chunkText">ChunkText</MethodLink>(<Variable>x</Variable>.text):</div>
              <div className="whitespace-pre">    <Variable>prediction</Variable> = <MethodLink href="/docs/architecture/predictNext">PredictNextToken</MethodLink>(observedChunk, <Variable>runtimeWeights</Variable>)</div>
              <div className="whitespace-pre">    <Variable>fastState</Variable> = <MethodLink href="/docs/architecture/fastAdaptation">FastAdaptation</MethodLink>(</div>
              <div className="whitespace-pre">        <Variable>fastState</Variable>,</div>
              <div className="whitespace-pre">        observedChunk,</div>
              <div className="whitespace-pre">        <Variable>prediction</Variable></div>
              <div className="whitespace-pre">    )</div>
              <div className="whitespace-pre">    <Variable>runtimeWeights</Variable> = <MethodLink href="/docs/architecture/bindFastState">BindFastState</MethodLink>(<Variable>durableWeights</Variable>, <Variable>fastState</Variable>)</div>
              <div className="whitespace-pre">    <Variable>output</Variable>.append(<MethodLink href="/docs/architecture/output">OutputHead</MethodLink>(<Variable>runtimeWeights</Variable>))</div>
              <div className="whitespace-pre"><Variable>persistence</Variable> = <MethodLink href="/docs/architecture/persistencePolicy">WeightPersistencePolicy</MethodLink>(<Variable>fastState</Variable>)</div>
              <div className="whitespace-pre"><Keyword>if</Keyword> persistence.mode == "consolidate":</div>
              <div className="whitespace-pre">    <Variable>durableWeights</Variable> = <MethodLink href="/docs/architecture/consolidate">ConsolidateWeights</MethodLink>(<Variable>durableWeights</Variable>, <Variable>fastState</Variable>)</div>
              <div className="whitespace-pre">    <MethodLink href="/docs/architecture/saveWeights">SaveWeights</MethodLink>(<Variable>durableWeights</Variable>, scope = "model")</div>
              <div className="whitespace-pre"><Keyword>return</Keyword> <Variable>output</Variable>, <Variable>fastState</Variable></div>
            </code>
          </div>
        </section>
      </div>

    </DocsShell>
  );
}
