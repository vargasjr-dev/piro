"use client";

import Link from "next/link";

type DiagramKind = "observation" | "embedding" | "ctm";

const details: Record<DiagramKind, { title: string; subtitle: string }> = {
  observation: {
    title: "Observation",
    subtitle: "How the world becomes something Piro can reason over.",
  },
  embedding: {
    title: "Input embedding",
    subtitle: "How raw events become a structured representation for the thought loop.",
  },
  ctm: {
    title: "CTM core",
    subtitle: "How Piro repeatedly updates internal state before committing to an action.",
  },
};

function Box({
  x,
  y,
  width,
  height,
  title,
  detail,
  tone = "green",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail?: string;
  tone?: "green" | "blue" | "violet" | "orange";
}) {
  const colors = {
    green: { fill: "rgb(21 42 34 / 0.9)", stroke: "rgb(110 231 183 / 0.68)" },
    blue: { fill: "rgb(23 35 43 / 0.9)", stroke: "rgb(125 211 252 / 0.68)" },
    violet: { fill: "rgb(44 25 43 / 0.9)", stroke: "rgb(192 132 252 / 0.68)" },
    orange: { fill: "rgb(57 39 24 / 0.9)", stroke: "rgb(253 186 116 / 0.72)" },
  }[tone];

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="20" fill={colors.fill} stroke={colors.stroke} strokeWidth="2" />
      <text x={x + 18} y={y + 34} fill="#fff7ed" fontSize="17" fontWeight="650">{title}</text>
      {detail && <text x={x + 18} y={y + 62} fill="rgb(253 230 138 / 0.72)" fontSize="12">{detail}</text>}
    </g>
  );
}

function Arrow({
  d,
  color = "rgb(251 191 36 / 0.72)",
  dashed = false,
  marker = "gold",
}: {
  d: string;
  color?: string;
  dashed?: boolean;
  marker?: "gold" | "blue" | "orange" | "violet";
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeDasharray={dashed ? "8 7" : undefined}
      markerEnd={`url(#zoom-arrow-${marker})`}
    />
  );
}

function ObservationDiagram() {
  return (
    <svg viewBox="0 0 1000 500" className="mx-auto block h-auto w-full min-w-[700px]" role="img" aria-label="Observation zoomed architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
      </defs>
      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">WORLD → OBSERVATION REPRESENTATION</text>
      <Box x={36} y={150} width={190} height={104} title="World" detail="user · tools · tests · game" tone="violet" />
      <Box x={300} y={150} width={210} height={104} title="Event stream" detail="text · audio · image · tool result" tone="blue" />
      <Box x={584} y={150} width={190} height={104} title="Parser + normalizer" detail="common event schema" tone="green" />
      <Box x={842} y={150} width={122} height={104} title="Observation" detail="state at t" tone="orange" />
      <Arrow d="M226 202H300" marker="violet" color="rgb(192 132 252 / 0.72)" />
      <Arrow d="M510 202H584" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M774 202H842" marker="gold" />
      <Box x={190} y={350} width={250} height={96} title="Task / session context" detail="goal · identity · active commitments" tone="blue" />
      <Box x={560} y={350} width={250} height={96} title="Belief state update" detail="what Piro thinks is happening" tone="orange" />
      <Arrow d="M903 254V300H315V350" dashed marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M440 398H560" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <text x="190" y="314" fill="rgb(125 211 252 / 0.56)" fontSize="12">persistent context is not the raw world</text>
    </svg>
  );
}

function EmbeddingDiagram() {
  return (
    <svg viewBox="0 0 1000 500" className="mx-auto block h-auto w-full min-w-[700px]" role="img" aria-label="Input embedding zoomed architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
      </defs>
      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">OBSERVATION → STRUCTURED INTERNAL SIGNAL</text>
      <Box x={36} y={160} width={184} height={102} title="Observation" detail="event + context" tone="violet" />
      <Box x={284} y={160} width={184} height={102} title="Symbol / feature IDs" detail="discrete + continuous" tone="blue" />
      <Box x={532} y={160} width={184} height={102} title="Embedding lookup" detail="learned feature vectors" tone="green" />
      <Box x={780} y={160} width={184} height={102} title="Input signal" detail="per-neuron currents" tone="orange" />
      <Arrow d="M220 211H284" marker="violet" color="rgb(192 132 252 / 0.72)" />
      <Arrow d="M468 211H532" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M716 211H780" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Box x={214} y={356} width={232} height={94} title="Time / order channels" detail="position · recency · phase" tone="blue" />
      <Box x={554} y={356} width={232} height={94} title="Goal / memory channels" detail="intent · retrieved episodes" tone="orange" />
      <Arrow d="M872 262V312H330V356" dashed marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M330 450V470H670V450" dashed marker="orange" color="rgb(253 186 116 / 0.76)" />
      <text x="214" y="316" fill="rgb(125 211 252 / 0.56)" fontSize="12">the signal carries more than token identity</text>
    </svg>
  );
}

function CtmDiagram() {
  return (
    <svg viewBox="0 0 1000 620" className="mx-auto block h-auto w-full min-w-[700px]" role="img" aria-label="CTM core zoomed architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
      </defs>
      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">CTM CORE · REPEATED INTERNAL THOUGHT TICKS</text>
      <Box x={36} y={220} width={176} height={102} title="Input signal" detail="per-neuron currents" tone="violet" />
      <Box x={286} y={150} width={194} height={102} title="Neuron state" detail="activation + phase" tone="green" />
      <Box x={286} y={300} width={194} height={102} title="History buffer" detail="recent state trajectory" tone="blue" />
      <Box x={286} y={450} width={194} height={102} title="Sync attention" detail="coupling + assemblies" tone="orange" />
      <Box x={568} y={260} width={214} height={112} title="Residual tick update" detail="state ← state + update" tone="green" />
      <Box x={864} y={150} width={100} height={102} title="Output" detail="action" tone="violet" />
      <Box x={864} y={450} width={100} height={102} title="Stop?" detail="confidence" tone="orange" />
      <Arrow d="M212 271H250V201H286" marker="gold" />
      <Arrow d="M383 252V300" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M383 402V450" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Arrow d="M480 501H530V316H568" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Arrow d="M480 201H568V316" marker="gold" />
      <Arrow d="M782 316H864V201" marker="gold" />
      <Arrow d="M782 316H820V501H864" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Arrow d="M864 501H820V316H782" dashed marker="blue" color="rgb(125 211 252 / 0.72)" />
      <path d="M568 260C520 90 760 70 820 180C850 235 820 316 782 316" fill="none" stroke="rgb(110 231 183 / 0.72)" strokeWidth="2" strokeDasharray="8 7" markerEnd="url(#zoom-arrow-gold)" />
      <text x="580" y="108" fill="rgb(167 243 208 / 0.7)" fontSize="12">repeat until confident or budget exhausted</text>
      <text x="36" y="590" fill="rgb(253 230 138 / 0.62)" fontSize="12">The CTM is not one pass: it is a recurrent state transition that can spend more internal compute when the problem demands it.</text>
    </svg>
  );
}

export default function ZoomedArchitectureDiagram({ kind }: { kind: DiagramKind }) {
  const detail = details[kind];
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">Architecture detail</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-amber-50 md:text-4xl">{detail.title}</h1>
          <p className="mt-3 text-base leading-7 text-amber-200/65">{detail.subtitle}</p>
        </div>
        <Link href="/docs/architecture" className="shrink-0 text-sm text-orange-300 transition hover:text-orange-100">← Full model</Link>
      </div>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#100c0a] p-3 sm:p-6">
        {kind === "observation" && <ObservationDiagram />}
        {kind === "embedding" && <EmbeddingDiagram />}
        {kind === "ctm" && <CtmDiagram />}
      </div>
    </>
  );
}
