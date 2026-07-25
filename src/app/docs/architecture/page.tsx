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
      description="Piro separates durable model knowledge from fast session state. This is the technical view of the model loop that powers the training and API surfaces."
    >
      <div className="grid gap-5 lg:grid-cols-[0.76fr_1.24fr]">
        <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-[#13100c] p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">The contract</p>
          <h2 className="mt-4 text-2xl font-bold text-amber-50">Fast state. Durable weights.</h2>
          <p className="mt-4 text-sm leading-relaxed text-amber-300/60">
            A Piro invocation can adapt quickly without forcing every observation into durable model knowledge. Persistence is an explicit policy decision: keep the update transient, checkpoint the session, or consolidate it into the model.
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
              <div className="whitespace-pre"><Variable>fastState</Variable> = <MethodLink href="/docs/architecture/initializeFastState">InitializeFastState</MethodLink>(<Variable>durableWeights</Variable>, sessionId)</div>
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
              <div className="whitespace-pre"><Keyword>elif</Keyword> persistence.mode == "session-checkpoint":</div>
              <div className="whitespace-pre">    <MethodLink href="/docs/architecture/saveWeights">SaveWeights</MethodLink>(<Variable>fastState</Variable>, scope = "session")</div>
              <div className="whitespace-pre"><Keyword>return</Keyword> <Variable>output</Variable></div>
            </code>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-amber-400/45">Every linked operation is a place where the model can be inspected, benchmarked, and improved. The pseudocode is intentionally a product contract before it is a service implementation.</p>
        </section>
      </div>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {["Durable knowledge", "Fast adaptation", "Explicit persistence"].map((title, index) => (
          <article key={title} className="rounded-2xl border border-amber-900/30 bg-[#13100c] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">0{index + 1}</p>
            <h2 className="mt-4 font-semibold text-amber-50">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/55">
              {index === 0 ? "Model-level knowledge is durable, versioned, and shared only according to the deployment contract." : index === 1 ? "Session state can adapt quickly as the model processes observations without forcing every update into durable weights." : "Piro makes persistence a policy decision: consolidate to the model, checkpoint the session, or keep the update transient."}
            </p>
          </article>
        ))}
      </section>
    </DocsShell>
  );
}
