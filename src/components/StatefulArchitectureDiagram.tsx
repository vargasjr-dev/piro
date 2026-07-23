"use client";

import { useRouter } from "next/navigation";

type NodeId =
  | "observation"
  | "embedding"
  | "initialize"
  | "attention"
  | "delta"
  | "residual"
  | "history"
  | "shouldHalt"
  | "output"
  | "weights"
  | "plasticity";

type Tone = "violet" | "green" | "blue" | "orange";

type DiagramNode = {
  id: NodeId;
  title: string;
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
    x: 55.5,
    y: 343.75,
    width: 165,
    height: 82.5,
    tone: "violet",
    zoomable: true,
  },
  {
    id: "embedding",
    title: "Embed",
    x: 331.25,
    y: 343.75,
    width: 187.5,
    height: 82.5,
    tone: "green",
    zoomable: true,
  },
  {
    id: "initialize",
    title: "InitializeOrRetrieveState",
    x: 650,
    y: 250,
    width: 247.5,
    height: 82.5,
    tone: "blue",
    zoomable: true,
  },
  {
    id: "attention",
    title: "Attention",
    x: 1050,
    y: 250,
    width: 255,
    height: 82.5,
    tone: "green",
    zoomable: true,
  },
  {
    id: "delta",
    title: "ComputeStateDelta",
    x: 1460,
    y: 250,
    width: 292.5,
    height: 82.5,
    tone: "green",
    zoomable: true,
  },
  {
    id: "residual",
    title: "ApplyGatedStateUpdate",
    x: 1920,
    y: 250,
    width: 225,
    height: 82.5,
    tone: "green",
    zoomable: true,
  },
  {
    id: "history",
    title: "UpdateHistory",
    x: 1957.5,
    y: 458.75,
    width: 225,
    height: 82.5,
    tone: "blue",
    zoomable: true,
  },
  {
    id: "shouldHalt",
    title: "ShouldHalt",
    x: 1842.5,
    y: 783.75,
    width: 255,
    height: 82.5,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "output",
    title: "OutputHead",
    x: 1467.5,
    y: 1023.75,
    width: 225,
    height: 82.5,
    tone: "green",
    zoomable: true,
  },
  {
    id: "weights",
    title: "Weights",
    x: 683.75,
    y: 393.75,
    width: 202.5,
    height: 82.5,
    tone: "blue",
    zoomable: true,
  },
  {
    id: "plasticity",
    title: "PlasticityController",
    x: 375,
    y: 973.75,
    width: 270,
    height: 82.5,
    tone: "orange",
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
      <text x={node.x + node.width / 2} y={node.y + node.height / 2 + 6} fill={style.title} fontSize="16" fontWeight="650" textAnchor="middle">
        {node.title}
      </text>
    </g>
  );
}

function InputLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} fill="rgb(253 230 138 / 0.62)" fontSize="11" textAnchor="middle">
      {children}
    </text>
  );
}

export default function StatefulArchitectureDiagram() {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#100c0a] p-3 sm:p-5">
      <svg
        className="mx-auto block h-auto w-full min-w-[1100px]"
        viewBox="0 0 2320 1210"
        role="img"
        aria-label="Piro CTM pseudocode mapped to method nodes and data flow"
      >
        <defs>
          <marker id="arrow-violet" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.7)" /></marker>
          <marker id="arrow-green" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(110 231 183 / 0.7)" /></marker>
          <marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
          <marker id="arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        </defs>

        <text x="24" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">PSEUDOCODE VIEW · METHOD INPUTS ARE EXPLICIT EDGES</text>
        <text x="24" y="74" fill="rgb(253 230 138 / 0.72)" fontSize="15">Each node is a transformation. The graph currently shows the trusted initialization flow and the inputs feeding Attention and ComputeStateDelta so each later edge can be reviewed independently.</text>

        <rect x="260" y="92" width="2010" height="1048" rx="30" fill="rgb(16 12 10 / 0.22)" stroke="rgb(251 191 36 / 0.28)" strokeWidth="2" strokeDasharray="9 8" />
        <text x="292" y="128" fill="rgb(251 191 36 / 0.68)" fontSize="13" letterSpacing="2">PIRO MODEL</text>

        <rect x="1000" y="150" width="1270" height="760" rx="30" fill="rgb(21 42 34 / 0.1)" stroke="rgb(110 231 183 / 0.28)" strokeWidth="2" strokeDasharray="9 8" />
        <text x="1032" y="186" fill="rgb(110 231 183 / 0.7)" fontSize="12" letterSpacing="1.8">RECURRENT LOOP · k · SHOULDHALT CONTROL</text>

        <rect x="260" y="930" width="2000" height="210" rx="30" fill="rgb(57 39 24 / 0.1)" stroke="rgb(253 186 116 / 0.3)" strokeWidth="2" strokeDasharray="7 7" />
        <text x="292" y="966" fill="rgb(253 186 116 / 0.72)" fontSize="12" letterSpacing="1.8">ONLINE WEIGHT UPDATE</text>

        {arrowPath("M220.5 385H331.25", "rgb(192 132 252 / 0.7)", { marker: "arrow-violet" })}
        <InputLabel x={275} y={368}>Observation</InputLabel>

        {arrowPath("M518.75 385V291.25H650", "rgb(110 231 183 / 0.7)", { marker: "arrow-green" })}
        <InputLabel x={585} y={350}>x</InputLabel>
        {arrowPath("M518.75 385V520H920V291.25H1050", "rgb(110 231 183 / 0.7)", { marker: "arrow-green" })}
        <InputLabel x={760} y={512}>x</InputLabel>

        {arrowPath("M785 393.75V332.5", "rgb(125 211 252 / 0.7)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={785} y={365}>weights</InputLabel>
        {arrowPath("M886.25 435H980V291.25H1050", "rgb(125 211 252 / 0.7)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={955} y={340}>weights</InputLabel>

        {arrowPath("M897.5 291.25H1050", "rgb(125 211 252 / 0.7)", { marker: "arrow-blue" })}
        <InputLabel x={970} y={280}>hₖ</InputLabel>
        {arrowPath("M2182.5 500H1380V291.25H1050", "rgb(125 211 252 / 0.7)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={1680} y={490}>historyₖ</InputLabel>

        {arrowPath("M1305 291.25H1460", "rgb(110 231 183 / 0.7)", { marker: "arrow-green" })}
        <InputLabel x={1382} y={280}>contextₖ</InputLabel>
        {arrowPath("M897.5 291.25H1180V215H1400V291.25H1460", "rgb(125 211 252 / 0.7)", { marker: "arrow-blue" })}
        <InputLabel x={1190} y={205}>hₖ</InputLabel>
        {arrowPath("M518.75 385V560H1360V310H1460", "rgb(110 231 183 / 0.7)", { marker: "arrow-green" })}
        <InputLabel x={940} y={552}>x</InputLabel>
        {arrowPath("M886.25 435H1280V350H1460", "rgb(125 211 252 / 0.7)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={1130} y={340}>weights</InputLabel>
        {arrowPath("M1957.5 500H1320V370H1460", "rgb(125 211 252 / 0.7)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={1600} y={360}>historyₖ</InputLabel>

        {nodes.map((node) => (
          <DiagramNodeCard key={node.id} node={node} onClick={() => router.push(`/docs/architecture/${node.id}`)} />
        ))}

        <text x="650" y="1175" fill="rgb(253 230 138 / 0.62)" fontSize="13">Attention and ComputeStateDelta inputs now use boxed orthogonal routes; later recurrent edges remain intentionally omitted while the flow is reviewed one transformation at a time.</text>
      </svg>
    </div>
  );
}
