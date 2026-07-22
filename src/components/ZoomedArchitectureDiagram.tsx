"use client";

import Link from "next/link";

type DiagramKind =
  | "observation"
  | "embedding"
  | "ctm"
  | "neuron"
  | "history"
  | "attention"
  | "ticks"
  | "prediction"
  | "eligibility"
  | "output"
  | "weights"
  | "update";

const details: Record<DiagramKind, { title: string; subtitle: string }> = {
  observation: {
    title: "PiroInput",
    subtitle: "The structured multimodal object that crosses into Piro’s stateful model.",
  },
  embedding: {
    title: "Input embedding",
    subtitle: "How PiroInput becomes the numerical signal consumed by the CTM.",
  },
  ctm: {
    title: "Stateful CTM",
    subtitle: "The recurrent thought dynamics that transform internal signals into model activity.",
  },
  output: {
    title: "Output",
    subtitle: "How Piro exposes its internal state as text, tool, and environment outputs.",
  },
  weights: {
    title: "Internal memory",
    subtitle: "How changing weights carry what Piro has learned across inputs.",
  },
  update: {
    title: "Plasticity controller",
    subtitle: "How Piro’s architecture determines which internal weights change and when.",
  },
  neuron: {
    title: "Neuron state",
    subtitle: "The recurrent state variables that carry active model dynamics from one thought tick to the next.",
  },
  history: {
    title: "History buffer",
    subtitle: "The short-term trajectory that lets each thought tick see how the internal state has been changing.",
  },
  attention: {
    title: "Sync attention",
    subtitle: "How synchronized neural activity couples features into temporary reasoning assemblies.",
  },
  ticks: {
    title: "Thought ticks",
    subtitle: "Repeated internal state updates that let Piro spend more computation before producing output.",
  },
  prediction: {
    title: "Prediction + value",
    subtitle: "The internal expectations that turn inference into a source of learning signals.",
  },
  eligibility: {
    title: "Eligibility + credit",
    subtitle: "The internal signals that determine which active pathways remain eligible for weight updates.",
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
  marker?: "gold" | "blue" | "orange" | "violet" | "green";
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
    <svg viewBox="0 0 1200 860" className="mx-auto block h-auto w-full min-w-[760px]" role="img" aria-label="PiroInput stateful multimodal input API">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
        <marker id="zoom-arrow-green" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(110 231 183 / 0.72)" /></marker>
      </defs>

      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">STATEFUL OBSERVATION REQUEST</text>
      <text x="36" y="72" fill="rgb(253 230 138 / 0.72)" fontSize="15">A session selects Piro’s persistent runtime; this request describes the current turn.</text>

      <rect x="36" y="116" width="1128" height="492" rx="28" fill="rgb(16 12 10 / 0.55)" stroke="rgb(251 191 36 / 0.2)" strokeWidth="2" strokeDasharray="8 8" />
      <text x="64" y="152" fill="rgb(251 191 36 / 0.64)" fontSize="12" letterSpacing="2">REQUEST BODY · JSON-LIKE API SHAPE</text>

      <rect x="64" y="182" width="816" height="388" rx="24" fill="rgb(23 35 43 / 0.18)" stroke="rgb(125 211 252 / 0.62)" strokeWidth="2" strokeDasharray="8 7" />
      <text x="92" y="218" fill="rgb(125 211 252 / 0.9)" fontSize="20" fontWeight="650">parts</text>
      <text x="168" y="218" fill="rgb(125 211 252 / 0.55)" fontSize="13">array of multimodal input items</text>

      <Box x={92} y={246} width={224} height={90} title="Text" detail="the user’s current turn" tone="green" />
      <Box x={348} y={246} width={224} height={90} title="Image" detail="photo · screenshot · frame" tone="violet" />
      <Box x={604} y={246} width={224} height={90} title="Audio" detail="speech · sound · recording" tone="blue" />
      <Box x={92} y={366} width={224} height={90} title="Video" detail="short temporal evidence" tone="orange" />
      <Box x={348} y={366} width={224} height={90} title="File / document" detail="PDF · code · structured data" tone="blue" />
      <Box x={604} y={366} width={224} height={90} title="Environment event" detail="browser · game · sensor" tone="orange" />
      <Box x={348} y={486} width={224} height={64} title="Tool result" detail="fresh output from an action" tone="violet" />

      <Box x={920} y={286} width={208} height={124} title="metadata" detail="mime · timestamp · source" tone="green" />
      <text x="920" y="438" fill="rgb(110 231 183 / 0.62)" fontSize="13">request-level context</text>

      <Arrow d="M472 570V654" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M1024 410V520H728V654" marker="green" color="rgb(110 231 183 / 0.72)" />
      <text x="472" y="632" fill="rgb(125 211 252 / 0.66)" fontSize="13" textAnchor="middle">parts</text>
      <text x="840" y="508" fill="rgb(110 231 183 / 0.66)" fontSize="13" textAnchor="middle">metadata</text>

      <Box x={450} y={654} width={300} height={96} title="PiroInput" detail="normalized observation packet" tone="orange" />
      <text x="600" y="800" fill="rgb(251 191 36 / 0.62)" fontSize="13" textAnchor="middle">the single input object consumed by the model for this turn</text>
    </svg>
  );
}

function EmbeddingDiagram() {
  return (
    <svg viewBox="0 0 1200 900" className="mx-auto block h-auto w-full min-w-[760px]" role="img" aria-label="PiroInput to CTM input embedding architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
        <marker id="zoom-arrow-green" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(110 231 183 / 0.72)" /></marker>
      </defs>

      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">PIROINPUT → CTM INPUT SIGNAL</text>
      <text x="36" y="72" fill="rgb(253 230 138 / 0.72)" fontSize="15">Embedding is the translation layer from the multimodal API object into neural state dynamics.</text>

      <Box x={36} y={146} width={260} height={120} title="PiroInput" detail="parts + metadata" tone="orange" />
      <Arrow d="M296 206H380" marker="gold" />
      <text x="338" y="190" fill="rgb(251 191 36 / 0.62)" fontSize="12" textAnchor="middle">split by type</text>

      <rect x="380" y="108" width="438" height="540" rx="28" fill="rgb(23 35 43 / 0.18)" stroke="rgb(125 211 252 / 0.62)" strokeWidth="2" strokeDasharray="8 7" />
      <text x="410" y="146" fill="rgb(125 211 252 / 0.9)" fontSize="20" fontWeight="650">Modality-specific encoders</text>
      <text x="410" y="174" fill="rgb(125 211 252 / 0.55)" fontSize="13">Each input type gets the frontend it needs.</text>

      <Box x={410} y={202} width={180} height={76} title="Text encoder" detail="tokens → vectors" tone="green" />
      <Box x={608} y={202} width={180} height={76} title="Image encoder" detail="pixels → features" tone="violet" />
      <Box x={410} y={302} width={180} height={76} title="Audio encoder" detail="waveform → features" tone="blue" />
      <Box x={608} y={302} width={180} height={76} title="Video encoder" detail="visual + time" tone="orange" />
      <Box x={410} y={402} width={180} height={76} title="File encoder" detail="document / code" tone="blue" />
      <Box x={608} y={402} width={180} height={76} title="Environment encoder" detail="events → features" tone="orange" />
      <Box x={410} y={502} width={180} height={76} title="Tool-result encoder" detail="structured output" tone="violet" />
      <Box x={608} y={502} width={180} height={76} title="Metadata encoder" detail="time · source · order" tone="green" />

      <Arrow d="M599 648V704" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M599 704H884" marker="gold" />
      <text x="599" y="684" fill="rgb(125 211 252 / 0.66)" fontSize="13" textAnchor="middle">align modality features</text>

      <Box x={884} y={650} width={280} height={112} title="Shared Piro representation" detail="aligned multimodal vectors + markers" tone="green" />
      <Arrow d="M1024 762V820" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Box x={884} y={820} width={280} height={72} title="CTM input signal" detail="numerical currents / features" tone="orange" />

      <text x="36" y="744" fill="rgb(253 230 138 / 0.62)" fontSize="13">The output preserves modality boundaries, ordering, timing, and provenance so the CTM can reason over the whole turn.</text>
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


function OutputDiagram() {
  return (
    <svg viewBox="0 0 1100 620" className="mx-auto block h-auto w-full min-w-[720px]" role="img" aria-label="Piro output architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">STATEFUL CTM → OUTPUT</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">One internal model state can drive several output interfaces.</text>
      <Box x={48} y={224} width={230} height={118} title="Stateful CTM" detail="shared internal activity" tone="green" />
      <Arrow d="M278 283H430" marker="gold" />
      <Box x={430} y={224} width={230} height={118} title="Output" detail="select and format a response" tone="orange" />
      <Arrow d="M660 283H820" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <rect x="820" y="150" width="230" height="300" rx="24" fill="rgb(23 35 43 / 0.18)" stroke="rgb(125 211 252 / 0.62)" strokeWidth="2" strokeDasharray="8 7" />
      <text x="850" y="188" fill="rgb(125 211 252 / 0.9)" fontSize="18" fontWeight="650">Output forms</text>
      <Box x={850} y={214} width={170} height={62} title="Text" detail="tokens" tone="green" />
      <Box x={850} y={294} width={170} height={62} title="Tool" detail="structured call" tone="violet" />
      <Box x={850} y={374} width={170} height={62} title="Environment" detail="external action" tone="blue" />
      <text x="48" y="520" fill="rgb(253 230 138 / 0.62)" fontSize="13">The output head is an interface boundary, not a second reasoning core.</text>
    </svg>
  );
}

function WeightsDiagram() {
  return (
    <svg viewBox="0 0 1100 620" className="mx-auto block h-auto w-full min-w-[720px]" role="img" aria-label="Piro internal memory architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">INTERNAL MEMORY · WEIGHT TIMESCALES</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">Piro remembers by changing the parameters that shape future dynamics.</text>
      <Box x={60} y={232} width={230} height={118} title="Stateful CTM" detail="activations and dynamics" tone="green" />
      <Arrow d="M290 291H430" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Box x={430} y={178} width={230} height={118} title="Plastic weights" detail="fast adaptation" tone="blue" />
      <Box x={430} y={354} width={230} height={118} title="Durable weights" detail="slow consolidation" tone="orange" />
      <Arrow d="M545 296V354" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Arrow d="M660 413H820V350H660" dashed marker="gold" color="rgb(251 191 36 / 0.72)" />
      <Box x={820} y={232} width={230} height={118} title="Future dynamics" detail="changed interpretation and action" tone="violet" />
      <text x="60" y="540" fill="rgb(253 230 138 / 0.62)" fontSize="13">The weights are not a memory database beside Piro; they are part of Piro.</text>
    </svg>
  );
}

function UpdateDiagram() {
  return (
    <svg viewBox="0 0 1100 620" className="mx-auto block h-auto w-full min-w-[720px]" role="img" aria-label="Piro learned self-update architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">MODEL-INTERNAL LEARNING</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">Piro contains the mechanism that decides how its own weights change.</text>
      <Box x={48} y={220} width={220} height={100} title="CTM activity" detail="state, predictions, values" tone="green" />
      <Box x={48} y={366} width={220} height={100} title="Input evidence" detail="new PiroInput" tone="violet" />
      <Arrow d="M268 270H410" marker="gold" />
      <Arrow d="M268 416H410" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Box x={410} y={276} width={260} height={122} title="Learned self-update" detail="eligibility · credit · plasticity" tone="orange" />
      <Arrow d="M670 337H820" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Box x={820} y={220} width={230} height={100} title="Plastic weights" detail="fast update" tone="blue" />
      <Box x={820} y={366} width={230} height={100} title="Durable weights" detail="slow update" tone="orange" />
      <Arrow d="M935 320V366" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <text x="48" y="540" fill="rgb(253 230 138 / 0.62)" fontSize="13">The update rule is architectural: it is not an external optimizer attached after deployment.</text>
    </svg>
  );
}


const componentDetails: Record<Exclude<DiagramKind, "observation" | "embedding" | "ctm" | "output" | "weights" | "update">, { input: string; output: string; relation: string; tone: "green" | "blue" | "orange" }> = {
  neuron: {
    input: "shared CTM input + prior state",
    output: "updated activation and phase",
    relation: "feeds the next internal state",
    tone: "green",
  },
  history: {
    input: "recent neuron-state trajectory",
    output: "short-term temporal context",
    relation: "makes change over time visible",
    tone: "blue",
  },
  attention: {
    input: "state history + synchronization",
    output: "coupled feature assemblies",
    relation: "selects what participates together",
    tone: "orange",
  },
  ticks: {
    input: "attention context + neuron state",
    output: "repeated thought updates",
    relation: "returns to neuron state until output is ready",
    tone: "green",
  },
  prediction: {
    input: "current state + selected action",
    output: "expected outcomes and value",
    relation: "creates signals the model can learn from",
    tone: "orange",
  },
  eligibility: {
    input: "active pathways + prediction mismatch",
    output: "credit eligibility over pathways",
    relation: "routes learning to the responsible dynamics",
    tone: "orange",
  },
};

function ComponentDiagram({ kind }: { kind: Exclude<DiagramKind, "observation" | "embedding" | "ctm" | "output" | "weights" | "update"> }) {
  const detail = componentDetails[kind];
  return (
    <svg viewBox="0 0 1100 620" className="mx-auto block h-auto w-full min-w-[720px]" role="img" aria-label={`${details[kind].title} architecture`}>
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">STATEFUL CTM COMPONENT</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">This component is part of Piro’s inference-and-learning substrate.</text>
      <Box x={54} y={232} width={250} height={122} title="Incoming signal" detail={detail.input} tone="violet" />
      <Arrow d="M304 293H425" marker="gold" />
      <Box x={425} y={214} width={260} height={158} title={details[kind].title} detail={detail.relation} tone={detail.tone} />
      <Arrow d="M685 293H806" marker={detail.tone === "blue" ? "blue" : detail.tone === "orange" ? "orange" : "gold"} color={detail.tone === "blue" ? "rgb(125 211 252 / 0.72)" : detail.tone === "orange" ? "rgb(253 186 116 / 0.76)" : undefined} />
      <Box x={806} y={232} width={240} height={122} title="Outgoing signal" detail={detail.output} tone={detail.tone} />
      <text x="54" y="520" fill="rgb(253 230 138 / 0.62)" fontSize="13">The component’s output becomes another internal signal, not a separate external service.</text>
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
        {(kind === "neuron" || kind === "history" || kind === "attention" || kind === "ticks" || kind === "prediction" || kind === "eligibility") && <ComponentDiagram kind={kind} />}
        {kind === "output" && <OutputDiagram />}
        {kind === "weights" && <WeightsDiagram />}
        {kind === "update" && <UpdateDiagram />}
      </div>
      {kind === "observation" && <ObservationApiReference />}
    </>
  );
}
