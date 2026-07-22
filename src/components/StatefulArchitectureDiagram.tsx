"use client";

import { useRouter } from "next/navigation";

type NodeId =
  | "observation"
  | "embedding"
  | "ctm"
  | "output"
  | "weights"
  | "update";

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
    x: 36,
    y: 302,
    width: 198,
    height: 108,
    tone: "violet",
    zoomable: true,
  },
  {
    id: "embedding",
    title: "Input embedding",
    lines: ["modality encoders", "shared representation"],
    x: 286,
    y: 302,
    width: 198,
    height: 108,
    tone: "green",
    zoomable: true,
  },
  {
    id: "ctm",
    title: "Stateful CTM",
    lines: ["recurrent thought dynamics", "activations · history · attention"],
    x: 528,
    y: 196,
    width: 312,
    height: 224,
    tone: "green",
    zoomable: true,
  },
  {
    id: "output",
    title: "Output / action heads",
    lines: ["text · tool · environment"],
    x: 866,
    y: 302,
    width: 138,
    height: 108,
    tone: "green",
  },
  {
    id: "weights",
    title: "Internal memory",
    lines: ["plastic weights", "durable weights"],
    x: 306,
    y: 548,
    width: 270,
    height: 108,
    tone: "blue",
  },
  {
    id: "update",
    title: "Learned self-update",
    lines: ["eligibility · prediction", "plasticity · consolidation"],
    x: 646,
    y: 548,
    width: 296,
    height: 108,
    tone: "orange",
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
  const Tag = node.zoomable ? "g" : "g";
  const titleY = node.y + 38;

  return (
    <Tag
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
      <text
        x={node.x + 18}
        y={titleY}
        fill={style.title}
        fontSize="17"
        fontWeight="650"
      >
        {node.title}
      </text>
      {node.lines.map((line, index) => (
        <text
          key={line}
          x={node.x + 18}
          y={node.y + 66 + index * 23}
          fill={style.detail}
          fontSize="12"
        >
          {line}
        </text>
      ))}
      {node.zoomable && (
        <text
          x={node.x + node.width - 18}
          y={node.y + 26}
          fill="rgb(251 146 60 / 0.78)"
          fontSize="13"
          textAnchor="end"
        >
          ↗
        </text>
      )}
    </Tag>
  );
}

export default function StatefulArchitectureDiagram() {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#100c0a] p-3 sm:p-5">
      <svg
        className="mx-auto block h-auto w-full min-w-[800px]"
        viewBox="0 0 1200 760"
        role="img"
        aria-label="Structural architecture of Piro as a stateful self-updating model"
      >
        <defs>
          <marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" />
          </marker>
          <marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" />
          </marker>
          <marker id="arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" />
          </marker>
          <marker id="arrow-violet" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" />
          </marker>
        </defs>

        <text x="24" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">STRUCTURAL VIEW · WHAT PIRO IS MADE OF</text>
        <text x="24" y="72" fill="rgb(253 230 138 / 0.72)" fontSize="15">Piro is a multimodal, stateful CTM whose internal weights serve as memory.</text>

        <text x="36" y="278" fill="rgb(192 132 252 / 0.62)" fontSize="12" letterSpacing="2">EXTERNAL INPUT</text>
        <text x="1034" y="278" fill="rgb(192 132 252 / 0.62)" fontSize="12" letterSpacing="2">EXTERNAL OUTPUT</text>

        <rect x="252" y="112" width="770" height="610" rx="30" fill="rgb(16 12 10 / 0.4)" stroke="rgb(251 191 36 / 0.28)" strokeWidth="2" strokeDasharray="9 8" />
        <text x="282" y="148" fill="rgb(251 191 36 / 0.68)" fontSize="13" letterSpacing="2">PIRO MODEL</text>

        <rect x="500" y="162" width="368" height="292" rx="26" fill="rgb(21 42 34 / 0.16)" stroke="rgb(110 231 183 / 0.28)" strokeWidth="1.5" strokeDasharray="7 7" />
        <text x="524" y="184" fill="rgb(110 231 183 / 0.62)" fontSize="11" letterSpacing="1.8">STATEFUL THOUGHT DYNAMICS</text>

        <text x="306" y="532" fill="rgb(125 211 252 / 0.56)" fontSize="11" letterSpacing="1.5">MEMORY SUBSTRATE</text>
        <text x="646" y="532" fill="rgb(253 186 116 / 0.62)" fontSize="11" letterSpacing="1.5">MODEL-INTERNAL LEARNING</text>

        {arrowPath("M234 356H286", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M484 356H528", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M840 356H866", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M1004 356H1032", "rgb(192 132 252 / 0.72)", { marker: "arrow-violet" })}

        {arrowPath("M684 420V548", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        <text x="700" y="486" fill="rgb(253 186 116 / 0.68)" fontSize="12">internal learning signals</text>
        {arrowPath("M646 602H576", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        <text x="611" y="586" fill="rgb(253 186 116 / 0.68)" fontSize="12" textAnchor="middle">updates weights</text>
        {arrowPath("M440 548V454", "rgb(125 211 252 / 0.72)", { marker: "arrow-blue" })}
        <text x="458" y="504" fill="rgb(125 211 252 / 0.68)" fontSize="12">memory shapes dynamics</text>

        {nodes.map((node) => (
          <DiagramNodeCard
            key={node.id}
            node={node}
            onClick={() => router.push(`/docs/architecture/${node.id}`)}
          />
        ))}

        <text x="274" y="700" fill="rgb(253 230 138 / 0.62)" fontSize="13">The update rule is part of the model; memory is carried by its changing weights.</text>
      </svg>
    </div>
  );
}
