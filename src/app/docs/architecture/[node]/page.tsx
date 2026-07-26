import Link from "next/link";
import DocsShell from "~/components/DocsShell";
import ZoomedArchitectureDiagram from "~/components/ZoomedArchitectureDiagram";

const supportedNodes = [
  "observation",
  "embedding",
  "initialize",
  "attention",
  "buildMemorySlots",
  "summarizeSynchronization",
  "getAttentionShape",
  "queryProjection",
  "keyProjection",
  "valueProjection",
  "relativeTimeBias",
  "synchronizationBias",
  "outputProjection",
  "readGate",
  "delta",
  "residual",
  "history",
  "output",
  "shouldHalt",
  "weights",
  "loadWeights",
  "saveWeights",
  "plasticity",
  "initializeFastState",
  "attentionWindow",
  "fastAdaptation",
  "bindFastState",
  "predictNext",
  "consolidate",
  "chunkText",
] as const;
type SupportedNode = (typeof supportedNodes)[number];

const titles: Record<SupportedNode, string> = {
  observation: "Observation",
  embedding: "Embed",
  initialize: "InitializeOrRetrieveState",
  attention: "Attention",
  buildMemorySlots: "BuildMemorySlots",
  summarizeSynchronization: "SummarizeSynchronization",
  getAttentionShape: "GetAttentionShape",
  queryProjection: "QueryProjection",
  keyProjection: "KeyProjection",
  valueProjection: "ValueProjection",
  relativeTimeBias: "RelativeTimeBias",
  synchronizationBias: "SynchronizationBias",
  outputProjection: "OutputProjection",
  readGate: "ReadGate",
  delta: "ComputeStateDelta",
  residual: "ApplyGatedStateUpdate",
  history: "UpdateHistory",
  output: "OutputHead",
  shouldHalt: "ShouldHalt",
  weights: "Weights",
  loadWeights: "LoadWeights",
  saveWeights: "SaveWeights",
  plasticity: "PlasticityController",
  initializeFastState: "InitializeFastState",
  attentionWindow: "GetAttentionWindow",
  fastAdaptation: "FastAdaptation",
  bindFastState: "BindFastState",
  predictNext: "PredictNextToken",
  consolidate: "ConsolidateWeights",
  chunkText: "ChunkText",
};

export function generateStaticParams() {
  return supportedNodes.map((node) => ({ node }));
}

export async function generateMetadata({ params }: { params: Promise<{ node: string }> }) {
  const { node } = await params;
  const titles: Record<SupportedNode, string> = {
    observation: "Observation",
    embedding: "Embed",
    initialize: "InitializeOrRetrieveState",
    attention: "Attention",
    buildMemorySlots: "BuildMemorySlots",
    summarizeSynchronization: "SummarizeSynchronization",
    getAttentionShape: "GetAttentionShape",
    queryProjection: "QueryProjection",
    keyProjection: "KeyProjection",
    valueProjection: "ValueProjection",
    relativeTimeBias: "RelativeTimeBias",
    synchronizationBias: "SynchronizationBias",
    outputProjection: "OutputProjection",
    readGate: "ReadGate",
    delta: "ComputeStateDelta",
    residual: "ApplyGatedStateUpdate",
    history: "UpdateHistory",
    output: "OutputHead",
    shouldHalt: "ShouldHalt",
    weights: "Weights",
    loadWeights: "LoadWeights",
    saveWeights: "SaveWeights",
    plasticity: "PlasticityController",
    initializeFastState: "InitializeFastState",
    attentionWindow: "GetAttentionWindow",
    fastAdaptation: "FastAdaptation",
    bindFastState: "BindFastState",
    predictNext: "PredictNextToken",
      consolidate: "ConsolidateWeights",
    chunkText: "ChunkText",
  };
  const title = titles[node as SupportedNode] ?? "Architecture";
  return {
    title: `${title} — Piro Architecture`,
    description: `Zoomed-in architecture diagram for ${title}.`,
  };
}

export default async function ArchitectureNodePage({ params }: { params: Promise<{ node: string }> }) {
  const { node } = await params;

  if (!supportedNodes.includes(node as SupportedNode)) {
    return (
      <main className="min-h-screen bg-[#0d0a08] px-6 py-16 text-amber-100">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold text-amber-50">Architecture node not found</h1>
          <Link href="/docs/architecture" className="mt-6 inline-block text-orange-300 hover:text-orange-100">← Back to architecture</Link>
        </div>
      </main>
    );
  }

  return (
    <DocsShell
      active="/docs/architecture"
      title={titles[node as SupportedNode] ?? "Architecture node"}
      description="A zoomed-in view of one operation in Piro’s stateful inference loop."
    >
      <div className="rounded-3xl border border-amber-900/30 bg-[#100c0a] p-6 shadow-2xl shadow-black/10 sm:p-8">
        <ZoomedArchitectureDiagram kind={node as SupportedNode} />
      </div>
      <Link href="/docs/architecture" className="mt-8 inline-block text-sm text-amber-400/50 transition hover:text-amber-200">
        ← Back to architecture
      </Link>
    </DocsShell>
  );
}
