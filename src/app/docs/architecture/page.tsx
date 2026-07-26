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
      title="Piro Inference Architecture"
      description="Piro learns during inference. It stores weights as fast and durable, and updates its weights using next token prediction on the input."
    >
      <div>
        <section className="rounded-3xl border border-amber-900/30 bg-[#100c0a] p-6 shadow-2xl shadow-black/10 sm:p-8">
          <div className="overflow-x-auto rounded-2xl border border-amber-900/20 bg-[#0b0908] px-4 py-5 sm:px-6" role="region" aria-label="Piro inference pseudocode">
            <code className="block min-w-[48rem] font-mono text-sm leading-6 text-amber-100/85">
              <div className="whitespace-pre"><Variable>durableWeights</Variable> = <MethodLink href="/docs/architecture/loadWeights">LoadWeights</MethodLink>()</div>
              <div className="whitespace-pre"><Variable>fastState</Variable> = <MethodLink href="/docs/architecture/initializeFastState">InitializeFastState</MethodLink>(<Variable>durableWeights</Variable>)</div>
              <div className="whitespace-pre"><Variable>x</Variable> = <MethodLink href="/docs/architecture/embedding">Embed</MethodLink>(<Link href="/docs/architecture/observation" className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 transition hover:text-violet-100">PiroInput</Link>)</div>
              <div className="whitespace-pre"><Keyword>for</Keyword> each observedChunk in <MethodLink href="/docs/architecture/chunkText">ChunkText</MethodLink>(<Variable>x</Variable>.text):</div>
              <div className="whitespace-pre">    <Variable>runtimeWeights</Variable> = <MethodLink href="/docs/architecture/bindFastState">BindFastState</MethodLink>(<Variable>durableWeights</Variable>, <Variable>fastState</Variable>)</div>
              <div className="whitespace-pre">    <Variable>prediction</Variable> = <MethodLink href="/docs/architecture/predictNext">PredictNextToken</MethodLink>(observedChunk, <Variable>runtimeWeights</Variable>)</div>
              <div className="whitespace-pre">    <Variable>fastState</Variable> = <MethodLink href="/docs/architecture/fastAdaptation">FastAdaptation</MethodLink>(</div>
              <div className="whitespace-pre">        <Variable>fastState</Variable>,</div>
              <div className="whitespace-pre">        observedChunk,</div>
              <div className="whitespace-pre">        <Variable>prediction</Variable></div>
              <div className="whitespace-pre">    )</div>
              <div className="whitespace-pre"><Variable>runtimeWeights</Variable> = <MethodLink href="/docs/architecture/bindFastState">BindFastState</MethodLink>(<Variable>durableWeights</Variable>, <Variable>fastState</Variable>)</div>
              <div className="whitespace-pre"><Variable>output</Variable> = <MethodLink href="/docs/architecture/output">OutputHead</MethodLink>(<Variable>runtimeWeights</Variable>)</div>
              <div className="whitespace-pre"><Variable>durableWeights</Variable> = <MethodLink href="/docs/architecture/consolidate">ConsolidateWeights</MethodLink>(<Variable>durableWeights</Variable>, <Variable>fastState</Variable>)</div>
              <div className="whitespace-pre"><MethodLink href="/docs/architecture/saveWeights">SaveWeights</MethodLink>(<Variable>durableWeights</Variable>)</div>
              <div className="whitespace-pre"><Keyword>return</Keyword> <Variable>output</Variable></div>
            </code>
          </div>
        </section>
      </div>

    </DocsShell>
  );
}
