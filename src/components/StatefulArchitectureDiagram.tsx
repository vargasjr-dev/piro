"use client";

import { useRouter } from "next/navigation";

type NodeId =
  | "observation"
  | "embedding"
  | "ctm"
  | "policy"
  | "environment"
  | "prediction"
  | "eligibility"
  | "consequence"
  | "error"
  | "credit"
  | "fast"
  | "consolidation";

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
    title: "Observation",
    lines: ["tokens · tools · world"],
    x: 24,
    y: 180,
    width: 166,
    height: 92,
    tone: "violet",
    zoomable: true,
  },
  {
    id: "embedding",
    title: "Input embedding",
    lines: ["semantic representation"],
    x: 224,
    y: 180,
    width: 180,
    height: 92,
    tone: "green",
    zoomable: true,
  },
  {
    id: "ctm",
    title: "CTM core",
    lines: ["neuron state · history", "sync attention · thought ticks"],
    x: 438,
    y: 148,
    width: 286,
    height: 156,
    tone: "green",
    zoomable: true,
  },
  {
    id: "policy",
    title: "Policy / output head",
    lines: ["token · tool call · action"],
    x: 758,
    y: 180,
    width: 196,
    height: 92,
    tone: "green",
  },
  {
    id: "environment",
    title: "Environment",
    lines: ["user · tools · tests · game"],
    x: 988,
    y: 180,
    width: 184,
    height: 92,
    tone: "violet",
  },
  {
    id: "prediction",
    title: "Pending prediction",
    lines: ["what did I expect?"],
    x: 72,
    y: 430,
    width: 210,
    height: 94,
    tone: "blue",
  },
  {
    id: "eligibility",
    title: "Eligibility trace",
    lines: ["which actions can earn credit?"],
    x: 326,
    y: 430,
    width: 222,
    height: 94,
    tone: "blue",
  },
  {
    id: "consequence",
    title: "Later consequence",
    lines: ["ordinary observation", "from the environment"],
    x: 592,
    y: 430,
    width: 216,
    height: 94,
    tone: "violet",
  },
  {
    id: "error",
    title: "Prediction + value error",
    lines: ["what happened vs. expected"],
    x: 852,
    y: 430,
    width: 244,
    height: 94,
    tone: "orange",
  },
  {
    id: "consolidation",
    title: "Replay + consolidation",
    lines: ["repeated evidence → durable learning"],
    x: 84,
    y: 622,
    width: 252,
    height: 94,
    tone: "blue",
  },
  {
    id: "credit",
    title: "Hindsight credit",
    lines: ["attribute outcomes to decisions"],
    x: 424,
    y: 622,
    width: 238,
    height: 94,
    tone: "orange",
  },
  {
    id: "fast",
    title: "Fast task adaptation",
    lines: ["belief · plan · value · fast state"],
    x: 752,
    y: 622,
    width: 252,
    height: 94,
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
        className="mx-auto block h-auto w-full min-w-[760px]"
        viewBox="0 0 1200 760"
        role="img"
        aria-label="Piro stateful RL-first model architecture"
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

        <path d="M24 92H1172" stroke="rgb(251 191 36 / 0.1)" strokeDasharray="5 10" />
        <text x="24" y="73" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">ACT / PREDICT</text>
        <path d="M24 372H1172" stroke="rgb(251 191 36 / 0.1)" strokeDasharray="5 10" />
        <text x="24" y="353" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">ENCOUNTER CONSEQUENCES</text>
        <path d="M24 578H1172" stroke="rgb(251 191 36 / 0.1)" strokeDasharray="5 10" />
        <text x="24" y="559" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">ASSIGN CREDIT / ADAPT / CONSOLIDATE</text>

        {arrowPath("M190 226H224", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M404 226H438", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M724 226H758", "rgb(251 191 36 / 0.72)")}
        {arrowPath("M954 226H988", "rgb(251 191 36 / 0.72)")}

        {arrowPath("M581 148V116C581 96 690 96 690 148", "rgb(110 231 183 / 0.72)", { dashed: true })}
        <text x="585" y="112" fill="rgb(167 243 208 / 0.68)" fontSize="12">repeated internal thought ticks</text>

        {arrowPath("M856 272V382H177V430", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        {arrowPath("M856 272V396H437V430", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        {arrowPath("M1080 272V430", "rgb(192 132 252 / 0.72)", { marker: "arrow-violet" })}
        {arrowPath("M808 477H852", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        {arrowPath("M548 477C548 568 543 568 543 622", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        {arrowPath("M974 524V578H543V622", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        {arrowPath("M437 524V578H210V622", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        {arrowPath("M662 669H752", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        {arrowPath("M1000 622V326H581V304", "rgb(125 211 252 / 0.7)", { dashed: true, marker: "arrow-blue" })}
        {arrowPath("M336 669H424", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}

        {nodes.map((node) => (
          <DiagramNodeCard
            key={node.id}
            node={node}
            onClick={() => router.push(`/docs/architecture/${node.id}`)}
          />
        ))}
      </svg>
    </div>
  );
}
