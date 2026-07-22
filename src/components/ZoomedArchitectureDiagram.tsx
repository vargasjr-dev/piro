"use client";

import Link from "next/link";

type DiagramKind = "observation" | "embedding" | "ctm";

const details: Record<DiagramKind, { title: string; subtitle: string }> = {
  observation: {
    title: "Observation",
    subtitle: "One stateful turn: the user’s current multimodal input, with model state kept server-side.",
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
    <svg viewBox="0 0 1200 920" className="mx-auto block h-auto w-full min-w-[760px]" role="img" aria-label="Piro stateful observation input API">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
      </defs>

      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">ONE TURN IN · STATE LIVES OUTSIDE THE REQUEST</text>
      <text x="36" y="72" fill="rgb(253 230 138 / 0.72)" fontSize="15">Piro does not resend the system prompt, conversation history, or previous tool calls.</text>
      <text x="36" y="98" fill="rgb(253 230 138 / 0.72)" fontSize="15">Each turn supplies the new observation; Piro’s hidden state carries continuity.</text>

      <rect x="36" y="136" width="1128" height="470" rx="28" fill="rgb(16 12 10 / 0.55)" stroke="rgb(251 191 36 / 0.2)" strokeWidth="2" strokeDasharray="8 8" />
      <text x="64" y="172" fill="rgb(251 191 36 / 0.64)" fontSize="12" letterSpacing="2">OBSERVATION REQUEST · JSON-LIKE API SHAPE</text>

      <Box x={72} y={212} width={244} height={118} title="Text" detail="the user’s current turn" tone="green" />
      <Box x={348} y={212} width={244} height={118} title="Image" detail="photo · screenshot · frame" tone="violet" />
      <Box x={624} y={212} width={244} height={118} title="Audio" detail="speech · sound · recording" tone="blue" />
      <Box x={900} y={212} width={220} height={118} title="Video" detail="short temporal evidence" tone="orange" />

      <Box x={72} y={392} width={244} height={118} title="File / document" detail="PDF · code · structured data" tone="blue" />
      <Box x={348} y={392} width={244} height={118} title="Environment event" detail="browser · game · sensor" tone="orange" />
      <Box x={624} y={392} width={244} height={118} title="Tool result" detail="only when a tool just ran" tone="violet" />
      <Box x={900} y={392} width={220} height={118} title="Metadata" detail="mime · timestamp · source" tone="green" />

      {[
        "M194 330V392",
        "M470 330V392",
        "M746 330V392",
        "M1010 330V392",
      ].map((d) => <Arrow key={d} d={d} dashed marker="blue" color="rgb(125 211 252 / 0.5)" />)}

      <path d="M316 568H884" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#zoom-arrow-gold)" />
      <text x="600" y="552" fill="rgb(251 191 36 / 0.64)" fontSize="13" textAnchor="middle">one observation packet for this turn</text>
      <Box x={884} y={524} width={236} height={88} title="PiroInput" detail="multimodal observation packet" tone="orange" />

      <text x="36" y="680" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">NOT PART OF THE REQUEST</text>
      <Box x={72} y={718} width={244} height={106} title="System policy" detail="stable model configuration" tone="blue" />
      <Box x={348} y={718} width={244} height={106} title="Conversation memory" detail="carried in recurrent state" tone="green" />
      <Box x={624} y={718} width={244} height={106} title="Previous tool calls" detail="already absorbed into state" tone="violet" />
      <Box x={900} y={718} width={220} height={106} title="Current belief" detail="updated after input" tone="orange" />
      <text x="72" y="866" fill="rgb(125 211 252 / 0.65)" fontSize="13">These are maintained by the stateful runtime, not repeated by the caller.</text>
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


function ObservationApiReference() {
  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-2xl border border-orange-300/25 bg-orange-300/[0.05] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-200/70">Proposed request contract</p>
        <p className="mt-2 text-sm leading-6 text-amber-200/65">
          The session identifies which persistent state to continue. The body is only the new observation for this turn.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-amber-900/30 bg-[#0b0908] p-4 text-[11px] leading-6 text-amber-100/80"><code>{`POST /v1/sessions/{session_id}/observe

{
  "parts": [
    { "type": "text", "text": "What is happening here?" },
    { "type": "image", "uri": "blob://...", "mime_type": "image/png" }
  ],
  "metadata": {
    "source": "ios",
    "captured_at": "2026-07-22T12:00:00Z"
  }
}`}</code></pre>
      </section>

      <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.05] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">Accepted parts</p>
        <div className="mt-4 space-y-3 text-sm text-amber-100/80">
          <div><code className="text-emerald-200">text</code><span className="ml-3 text-amber-200/55">typed user input</span></div>
          <div><code className="text-fuchsia-200">image</code><span className="ml-3 text-amber-200/55">photo, screenshot, camera frame</span></div>
          <div><code className="text-sky-200">audio</code><span className="ml-3 text-amber-200/55">speech or sound recording</span></div>
          <div><code className="text-orange-200">video</code><span className="ml-3 text-amber-200/55">short temporal visual input</span></div>
          <div><code className="text-sky-200">file</code><span className="ml-3 text-amber-200/55">PDF, code, or document</span></div>
          <div><code className="text-amber-200">json</code><span className="ml-3 text-amber-200/55">structured environment data</span></div>
        </div>
        <div className="mt-6 border-t border-sky-400/15 pt-4 text-xs leading-6 text-amber-200/55">
          <strong className="text-amber-100/80">Not sent every turn:</strong> system prompt, conversation transcript, previous tool calls, or durable memory. Those belong to the stateful runtime.
        </div>
      </section>
    </div>
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
      {kind === "observation" && <ObservationApiReference />}
    </>
  );
}
