import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";
import ZoomedArchitectureDiagram from "~/components/ZoomedArchitectureDiagram";

const supportedNodes = ["observation", "embedding", "ctm", "neuron", "history", "attention", "ticks", "prediction", "eligibility", "output", "weights", "update"] as const;
type SupportedNode = (typeof supportedNodes)[number];

export function generateStaticParams() {
  return supportedNodes.map((node) => ({ node }));
}

export async function generateMetadata({ params }: { params: Promise<{ node: string }> }) {
  const { node } = await params;
  const titles: Record<SupportedNode, string> = {
    observation: "PiroInput",
    embedding: "Input embedding",
    ctm: "Stateful CTM",
    neuron: "Neuron state",
    history: "History buffer",
    attention: "Sync attention",
    ticks: "Thought ticks",
    prediction: "Prediction + value",
    eligibility: "Eligibility + credit",
    output: "Output",
    weights: "Internal memory",
    update: "Plasticity controller",
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
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 lg:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 transition hover:opacity-80">
            <FlameLogo size={22} />
            <span className="hidden font-bold tracking-tight text-amber-50 sm:inline">Piro</span>
          </Link>
          <Link href="/docs" className="text-sm text-amber-400/60 transition hover:text-amber-100">Docs</Link>
          <span className="text-amber-900/50">/</span>
          <Link href="/docs/architecture" className="text-sm text-amber-400/60 transition hover:text-amber-100">Architecture</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <ZoomedArchitectureDiagram kind={node as SupportedNode} />
      </div>
    </main>
  );
}
