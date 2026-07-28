import Link from "next/link";
import DocsShell from "~/components/DocsShell";

function MethodLink({ href, children }: { href: string; children: string }) {
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
  description: "Borealis inference pseudocode.",
};

export default function ArchitecturePage() {
  return (
    <DocsShell
      active="/docs/architecture"
      title="Piro Inference Architecture"
      compact
    >
      <div
        className="overflow-x-auto rounded-2xl border border-amber-900/20 bg-[#0b0908] px-4 py-5 sm:px-6"
        role="region"
        aria-label="Borealis inference pseudocode"
      >
        <code className="block min-w-[58rem] font-mono text-sm leading-6 text-amber-100/85">
          <div className="whitespace-pre">
            <Variable>durableWeights</Variable> ={" "}
            <MethodLink href="/docs/architecture/loadWeights">
              LoadWeights
            </MethodLink>
            ()
          </div>
          <div className="whitespace-pre">
            <Variable>adaptationState</Variable> ={" "}
            <MethodLink href="/docs/architecture/initializeFastState">
              InitializeAdaptationState
            </MethodLink>
            (<Variable>durableWeights</Variable>)
          </div>
          <div className="whitespace-pre">
            <Variable>contextState</Variable> ={" "}
            <MethodLink href="/docs/architecture/initialize">
              InitializeContextState
            </MethodLink>
            ()
          </div>
          <div className="whitespace-pre"> </div>
          <div className="whitespace-pre">
            <Variable>x</Variable> ={" "}
            <MethodLink href="/docs/architecture/embedding">Embed</MethodLink>(
            <Link
              href="/docs/architecture/observation"
              className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 transition hover:text-violet-100"
            >
              PiroInput
            </Link>
            )
          </div>
          <div className="whitespace-pre">
            <Keyword>for</Keyword> each <Variable>observedChunk</Variable> in
            <MethodLink href="/docs/architecture/chunkText">
              ChunkText
            </MethodLink>
            (<Variable>x</Variable>.text):
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>runtimeWeights</Variable> ={" "}
            <MethodLink href="/docs/architecture/bindFastState">
              BindAdaptationState
            </MethodLink>
            (<Variable>durableWeights</Variable>,{" "}
            <Variable>adaptationState</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>prediction</Variable> ={" "}
            <MethodLink href="/docs/architecture/predictNext">
              PredictNextToken
            </MethodLink>
            (<Variable>observedChunk</Variable>,{" "}
            <Variable>contextState</Variable>,
            <Variable>runtimeWeights</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>adaptationState</Variable> ={" "}
            <MethodLink href="/docs/architecture/fastAdaptation">
              AdaptationStep
            </MethodLink>
            (<Variable>adaptationState</Variable>,{" "}
            <Variable>observedChunk</Variable>,<Variable>prediction</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>contextState</Variable> ={" "}
            <MethodLink href="/docs/architecture/attention">
              AdvanceContextState
            </MethodLink>
            (<Variable>observedChunk</Variable>,{" "}
            <Variable>contextState</Variable>)
          </div>
          <div className="whitespace-pre"> </div>
          <div className="whitespace-pre">
            <Keyword>for</Keyword> step in range(maxNewTokens):
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>logits</Variable> ={" "}
            <MethodLink href="/docs/architecture/output">OutputHead</MethodLink>
            (<Variable>contextState</Variable>,{" "}
            <Variable>adaptationState</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>token</Variable> = Argmax(<Variable>logits</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}Emit(<Variable>token</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Keyword>if</Keyword> <Variable>token</Variable> == eosToken:
          </div>
          <div className="whitespace-pre">
            {"        "}
            <Keyword>break</Keyword>
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>contextState</Variable> ={" "}
            <MethodLink href="/docs/architecture/attention">
              AdvanceContextState
            </MethodLink>
            (<Variable>token</Variable>, <Variable>contextState</Variable>)
          </div>
          <div className="whitespace-pre"> </div>
          <div className="whitespace-pre">
            <Variable>durableWeights</Variable> ={" "}
            <MethodLink href="/docs/architecture/consolidate">
              ConsolidateWeights
            </MethodLink>
            (<Variable>durableWeights</Variable>,{" "}
            <Variable>adaptationState</Variable>)
          </div>
          <div className="whitespace-pre">
            <MethodLink href="/docs/architecture/saveWeights">
              SaveWeights
            </MethodLink>
            (<Variable>durableWeights</Variable>)
          </div>
        </code>
      </div>
    </DocsShell>
  );
}
