"use client";

import { useRouter } from "next/navigation";

type NodeId =
  | "observation"
  | "embedding"
  | "neuron"
  | "history"
  | "attention"
  | "ticks"
  | "prediction"
  | "eligibility"
  | "update"
  | "weights"
  | "output";

type Tone = "violet" | "green" | "blue" | "orange";

type DiagramNode = {
  id: NodeId;
  title: string;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  tone: Tone;
  zoomable?: boolean;
};

const nodes: DiagramNode[] = [
  {
    id: "observation",
    title: "PiroInput",
    lines: ["parts + metadata", "stateful input boundary"],
    x: 32,
    y: 500,
    width: 210,
    height: 112,
    tone: "violet",
    zoomable: true,
  },
  {
    id: "embedding",
    title: "Input embedding",
    lines: ["modality encoders", "shared representation"],
    x: 286,
    y: 500,
    width: 220,
    height: 112,
    tone: "green",
    zoomable: true,
  },
  {
    id: "neuron",
    title: "Neuron state",
    lines: ["recurrent state update"],
    x: 600,
    y: 300,
    width: 190,
    height: 112,
    tone: "green",
    zoomable: true,
  },
  {
    id: "history",
    title: "History buffer",
    lines: ["short-term temporal context"],
    x: 830,
    y: 300,
    width: 190,
    height: 112,
    tone: "green",
    zoomable: true,
  },
  {
    id: "attention",
    title: "Sync attention",
    lines: ["couples active features"],
    x: 1060,
    y: 300,
    width: 190,
    height: 112,
    tone: "green",
    zoomable: true,
  },
  {
    id: "ticks",
    title: "Thought ticks",
    lines: ["repeated internal updates"],
    x: 1290,
    y: 300,
    width: 190,
    height: 112,
    tone: "green",
    zoomable: true,
  },
  {
    id: "output",
    title: "Output",
    lines: ["text · tool · environment"],
    x: 1570,
    y: 500,
    width: 190,
    height: 112,
    tone: "green",
    zoomable: true,
  },
  {
    id: "prediction",
    title: "Prediction + value",
    lines: ["what the model expects"],
    x: 600,
    y: 700,
    width: 210,
    height: 112,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "eligibility",
    title: "Eligibility + credit",
    lines: ["what can still be updated"],
    x: 850,
    y: 700,
    width: 210,
    height: 112,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "update",
    title: "Plasticity controller",
    lines: ["learned weight-update rule"],
    x: 1100,
    y: 700,
    width: 230,
    height: 112,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "weights",
    title: "Internal memory",
    lines: ["plastic + durable weights"],
    x: 1370,
    y: 700,
    width: 210,
    height: 112,
    tone: "blue",
    zoomable: true,
  },
];

const toneStyles: Record<Tone, { fill: string; stroke: string; title: string; detail: string }> = {
  violet: {
    fill: "rgb(44 25 43 / 0.84)",
    stroke: "rgb(192 132 252 / 0.58)",
    title: "#fff7ed",
    detail: "rgb(253 186 116 / 0.68)",
  },
  green: {
    fill: "rgb(21 42 34 / 0.88)",
    stroke: "rgb(110 231 183 / 0.62)",
    title: "#fff7ed",
    detail: "rgb(253 230 138 / 0.72)",
  },
  blue: {
    fill: "rgb(23 35 43 / 0.88)",
    stroke: "rgb(125 211 252 / 0.62)",
    title: "#fff7ed",
    detail: "rgb(253 230 138 / 0.72)",
  },
  orange: {
    fill: "rgb(57 39 24 / 0.88)",
    stroke: "rgb(253 186 116 / 0.68)",
    title: "#fff7ed",
    detail: "rgb(253 230 138 / 0.72)",
  },
};

function arrowPath(
  d: string,
  color: string,
  options?: { dashed?: boolean; marker?: string },
) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeDasharray={options?.dashed ? "8 7" : undefined}
      markerEnd={`url(#${options?.marker ?? "arrow-gold"})`}
    />
  );
}

function DiagramNodeCard({
  node,
  onClick,
}: {
  node: DiagramNode;
  onClick: () => void;
}) {
  const style = toneStyles[node.tone];
  const titleY = node.y + 38;

  return (
    <g
      role={node.zoomable ? "button" : undefined}
      tabIndex={node.zoomable ? 0 : undefined}
      aria-label={node.zoomable ? `Zoom into ${node.title}` : node.title}
      onClick={node.zoomable ? onClick : undefined}
      onKeyDown={
        node.zoomable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={node.zoomable ? "cursor-pointer" : undefined}
    >
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx="22"
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth="2"
        className={node.zoomable ? "transition hover:brightness-125" : undefined}
      />
      <text x={node.x + 18} y={titleY} fill={style.title} fontSize="17" fontWeight="650">
        {node.title}
      </text>
      {node.lines.map((line, index) => (
        <text key={line} x={node.x + 18} y={node.y + 66 + index * 23} fill={style.detail} fontSize="12">
          {line}
        </text>
      ))}
    </g>
  );
}

export default function StatefulArchitectureDiagram() {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#100c0a] p-3 sm:p-5">
      <svg
        className="mx-auto block h-auto w-full min-w-[1050px]"
        viewBox="0 0 1800 1060"
        role="img"
        aria-label="Structural architecture of Piro as a stateful self-updating model"
      >
        <defs>
          <marker id="arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
          <marker id="arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
          <marker id="arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        </defs>

        <text x="24" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">STRUCTURAL VIEW · INFERENCE + LEARNING</text>
        <text x="24" y="72" fill="rgb(253 230 138 / 0.72)" fontSize="15">Piro’s inference dynamics and weight updates are part of one model.</text>

        <text x="32" y="470" fill="rgb(192 132 252 / 0.62)" fontSize="12" letterSpacing="2">EXTERNAL INPUT</text>
        <text x="1570" y="470" fill="rgb(192 132 252 / 0.62)" fontSize="12" letterSpacing="2">EXTERNAL OUTPUT</text>

        <rect x="260" y="110" width="1300" height="910" rx="30" fill="rgb(16 12 10 / 0.4)" stroke="rgb(251 191 36 / 0.28)" strokeWidth="2" strokeDasharray="9 8" />
        <text x="290" y="146" fill="rgb(251 191 36 / 0.68)" fontSize="13" letterSpacing="2">PIRO MODEL</text>

        <rect x="560" y="178" width="960" height="300" rx="26" fill="rgb(21 42 34 / 0.12)" stroke="rgb(110 231 183 / 0.28)" strokeWidth="1.5" strokeDasharray="7 7" />
        <text x="590" y="210" fill="rgb(110 231 183 / 0.7)" fontSize="12" letterSpacing="1.8">STATEFUL CTM · INFERENCE DYNAMICS</text>

        <rect x="560" y="570" width="960" height="380" rx="26" fill="rgb(57 39 24 / 0.1)" stroke="rgb(253 186 116 / 0.3)" strokeWidth="1.5" strokeDasharray="7 7" />
        <text x="590" y="602" fill="rgb(253 186 116 / 0.72)" fontSize="12" letterSpacing="1.8">LEARNING DURING INFERENCE</text>

        {arrowPath("M242 556H286", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M506 556H560V356H600", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M790 356H830", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M1020 356H1060", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M1250 356H1290", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M1480 356H1520V556H1570", "rgb(251 191 36 / 0.72)")}

        {arrowPath("M1385 412V650H705V700", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        {arrowPath("M1385 412V620H955V700", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        <text x="1190" y="548" fill="rgb(253 186 116 / 0.68)" fontSize="12">internal prediction signals</text>

        {arrowPath("M810 756H850", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        {arrowPath("M1060 756H1100", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        <text x="930" y="738" fill="rgb(253 186 116 / 0.68)" fontSize="12" textAnchor="middle">assign update signal</text>

        {arrowPath("M1330 756H1370", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        <text x="1350" y="738" fill="rgb(253 186 116 / 0.68)" fontSize="12" textAnchor="middle">change weights</text>

        {arrowPath("M1475 700V650H695V412", "rgb(125 211 252 / 0.72)", { marker: "arrow-blue" })}
        <text x="1010" y="638" fill="rgb(125 211 252 / 0.68)" fontSize="12" textAnchor="middle">memory shapes future inference dynamics</text>

        {nodes.map((node) => (
          <DiagramNodeCard key={node.id} node={node} onClick={() => router.push(`/docs/architecture/${node.id}`)} />
        ))}

        <text x="560" y="990" fill="rgb(253 230 138 / 0.62)" fontSize="13">The model predicts, evaluates, and updates its own weights as part of its design.</text>
      </svg>
    </div>
  );
}
