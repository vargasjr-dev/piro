import DocsShell from "~/components/DocsShell";

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
            <Variable>durableWeights</Variable> = LoadWeights()
          </div>
          <div className="whitespace-pre">
            <Variable>adaptationState</Variable> = InitializeAdaptationState(
            <Variable>durableWeights</Variable>)
          </div>
          <div className="whitespace-pre">
            <Variable>contextState</Variable> = InitializeContextState()
          </div>
          <div className="whitespace-pre"> </div>
          <div className="whitespace-pre">
            <Variable>x</Variable> = Embed(PiroInput)
          </div>
          <div className="whitespace-pre">
            <Keyword>for</Keyword> each <Variable>observedChunk</Variable> in
            ChunkText(
            <Variable>x</Variable>.text):
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>runtimeWeights</Variable> = BindAdaptationState(
            <Variable>durableWeights</Variable>,{" "}
            <Variable>adaptationState</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>prediction</Variable> = PredictNextToken(
            <Variable>observedChunk</Variable>,{" "}
            <Variable>contextState</Variable>,
            <Variable>runtimeWeights</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>adaptationState</Variable> = AdaptationStep(
            <Variable>adaptationState</Variable>,{" "}
            <Variable>observedChunk</Variable>,<Variable>prediction</Variable>)
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>contextState</Variable> = AdvanceContextState(
            <Variable>observedChunk</Variable>,{" "}
            <Variable>contextState</Variable>)
          </div>
          <div className="whitespace-pre"> </div>
          <div className="whitespace-pre">
            <Keyword>for</Keyword> step in range(maxNewTokens):
          </div>
          <div className="whitespace-pre">
            {"    "}
            <Variable>logits</Variable> = OutputHead(
            <Variable>contextState</Variable>,{" "}
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
            <Variable>contextState</Variable> = AdvanceContextState(
            <Variable>token</Variable>, <Variable>contextState</Variable>)
          </div>
          <div className="whitespace-pre"> </div>
          <div className="whitespace-pre">
            <Variable>durableWeights</Variable> = ConsolidateWeights(
            <Variable>durableWeights</Variable>,{" "}
            <Variable>adaptationState</Variable>)
          </div>
          <div className="whitespace-pre">
            SaveWeights(<Variable>durableWeights</Variable>)
          </div>
        </code>
      </div>
    </DocsShell>
  );
}
