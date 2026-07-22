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
  | "prediction"
  | "value"
  | "halt"
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
    x: 28,
    y: 330,
    width: 220,
    height: 110,
    tone: "violet",
    zoomable: true,
  },
  {
    id: "embedding",
    title: "Embed",
    x: 300,
    y: 330,
    width: 250,
    height: 110,
    tone: "green",
    zoomable: true,
  },
  {
    id: "initialize",
    title: "InitializeOrRetrieveState",
    x: 650,
    y: 150,
    width: 330,
    height: 110,
    tone: "blue",
    zoomable: true,
  },
  {
    id: "attention",
    title: "Attention",
    x: 1050,
    y: 150,
    width: 340,
    height: 110,
    tone: "green",
    zoomable: true,
  },
  {
    id: "delta",
    title: "ComputeStateDelta",
    x: 1460,
    y: 150,
    width: 390,
    height: 110,
    tone: "green",
    zoomable: true,
  },
  {
    id: "residual",
    title: "ApplyGatedResidual",
    x: 1920,
    y: 150,
    width: 300,
    height: 110,
    tone: "green",
    zoomable: true,
  },
  {
    id: "history",
    title: "UpdateHistory",
    x: 1920,
    y: 430,
    width: 300,
    height: 110,
    tone: "blue",
    zoomable: true,
  },
  {
    id: "prediction",
    title: "PredictionHead",
    x: 760,
    y: 770,
    width: 300,
    height: 110,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "value",
    title: "ValueHead",
    x: 1110,
    y: 770,
    width: 270,
    height: 110,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "halt",
    title: "HaltHead",
    x: 1430,
    y: 770,
    width: 340,
    height: 110,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "shouldHalt",
    title: "ShouldHalt",
    x: 1800,
    y: 770,
    width: 340,
    height: 110,
    tone: "orange",
    zoomable: true,
  },
  {
    id: "output",
    title: "OutputHead",
    x: 1430,
    y: 1010,
    width: 300,
    height: 110,
    tone: "green",
    zoomable: true,
  },
  {
    id: "weights",
    title: "Weights",
    x: 650,
    y: 300,
    width: 270,
    height: 110,
    tone: "blue",
    zoomable: true,
  },
  {
    id: "plasticity",
    title: "PlasticityController",
    x: 330,
    y: 960,
    width: 360,
    height: 110,
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
          <marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
          <marker id="arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
          <marker id="arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        </defs>

        <text x="24" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">PSEUDOCODE VIEW · METHOD INPUTS ARE EXPLICIT EDGES</text>
        <text x="24" y="74" fill="rgb(253 230 138 / 0.72)" fontSize="15">Each node is a transformation; state and data values travel on the edges between transformations.</text>

        <rect x="260" y="92" width="2010" height="1048" rx="30" fill="rgb(16 12 10 / 0.22)" stroke="rgb(251 191 36 / 0.28)" strokeWidth="2" strokeDasharray="9 8" />
        <text x="292" y="128" fill="rgb(251 191 36 / 0.68)" fontSize="13" letterSpacing="2">PIRO MODEL</text>

        <rect x="610" y="150" width="1660" height="760" rx="30" fill="rgb(21 42 34 / 0.1)" stroke="rgb(110 231 183 / 0.28)" strokeWidth="2" strokeDasharray="9 8" />
        <text x="642" y="186" fill="rgb(110 231 183 / 0.7)" fontSize="12" letterSpacing="1.8">INFERENCE DYNAMICS · k</text>

        <rect x="260" y="930" width="2000" height="210" rx="30" fill="rgb(57 39 24 / 0.1)" stroke="rgb(253 186 116 / 0.3)" strokeWidth="2" strokeDasharray="7 7" />
        <text x="292" y="966" fill="rgb(253 186 116 / 0.72)" fontSize="12" letterSpacing="1.8">ONLINE WEIGHT UPDATE</text>

        {arrowPath("M248 385H300", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={274} y={368}>Observation</InputLabel>

        {arrowPath("M550 385V205H650", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={594} y={310}>x</InputLabel>
        {arrowPath("M785 300V260", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={835} y={282}>weights</InputLabel>

        {arrowPath("M980 205H1050", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={1015} y={188}>h₀ enters as hₖ</InputLabel>
        {arrowPath("M980 205V300H1420V260", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={1220} y={292}>hₖ</InputLabel>
        {arrowPath("M980 205V350H1880V260", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={1410} y={342}>hₖ</InputLabel>

        {arrowPath("M1390 205H1460", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={1425} y={188}>contextₖ</InputLabel>
        {arrowPath("M1850 205H1920", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={1885} y={188}>deltaₖ</InputLabel>

        {arrowPath("M2220 260V430H2070", "rgb(251 191 36 / 0.72)")}
        <InputLabel x={2150} y={410}>hₖ₊₁</InputLabel>
        {arrowPath("M2070 540V640H1010V260", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={1530} y={625}>historyₖ₊₁ becomes historyₖ</InputLabel>
        {arrowPath("M2070 540V665H1395V260", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={1730} y={650}>historyₖ</InputLabel>

        {arrowPath("M2220 205H2280V82H1010V150", "rgb(110 231 183 / 0.72)", { dashed: true, marker: "arrow-gold" })}
        {arrowPath("M2220 205H2290V68H1420V150", "rgb(110 231 183 / 0.72)", { dashed: true, marker: "arrow-gold" })}
        {arrowPath("M2220 205H2300V54H1880V150", "rgb(110 231 183 / 0.72)", { dashed: true, marker: "arrow-gold" })}
        <InputLabel x={2140} y={72}>hₖ₊₁ → hₖ on next tick</InputLabel>
        <InputLabel x={2170} y={98}>recurrent state loop</InputLabel>

        {arrowPath("M2220 540V700H910V770", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        {arrowPath("M2220 540V685H1245V770", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        {arrowPath("M2220 540V670H1560V770", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        <InputLabel x={1080} y={690}>hₖ₊₁</InputLabel>
        <InputLabel x={1390} y={675}>hₖ₊₁</InputLabel>
        <InputLabel x={1710} y={660}>hₖ₊₁</InputLabel>

        {arrowPath("M1060 825H1110", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        {arrowPath("M1380 825H1430", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        {arrowPath("M1770 825H1800", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        <InputLabel x={1785} y={808}>haltₖ</InputLabel>

        {arrowPath("M920 355H1000V205H1050", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={980} y={345}>weights</InputLabel>
        {arrowPath("M920 355H1400V205H1460", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={1190} y={345}>weights</InputLabel>
        {arrowPath("M920 355H1880V205H1920", "rgb(125 211 252 / 0.72)", { dashed: true, marker: "arrow-blue" })}
        <InputLabel x={1640} y={345}>weights · internal gate</InputLabel>

        {arrowPath("M1970 880V1010H1730", "rgb(110 231 183 / 0.72)", { marker: "arrow-gold" })}
        <text x="1840" y="965" fill="rgb(110 231 183 / 0.68)" fontSize="12">exit → OutputHead</text>
        {arrowPath("M2070 260V960H1580V1010", "rgb(110 231 183 / 0.72)", { dashed: true, marker: "arrow-gold" })}
        <InputLabel x={1830} y={945}>hₖ₊₁ held for output</InputLabel>
        <text x="2150" y="610" fill="rgb(110 231 183 / 0.68)" fontSize="12" textAnchor="middle">continue while k &lt; Kmax</text>

        {arrowPath("M1060 825V900H510V960", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        {arrowPath("M1380 825V915H570V960", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        {arrowPath("M1770 825V930H630V960", "rgb(253 186 116 / 0.78)", { dashed: true, marker: "arrow-orange" })}
        <InputLabel x={790} y={900}>prediction · value · learning signals</InputLabel>
        {arrowPath("M690 1015H785V410", "rgb(253 186 116 / 0.78)", { marker: "arrow-orange" })}
        <InputLabel x={715} y={1000}>updated weights</InputLabel>

        {nodes.map((node) => (
          <DiagramNodeCard key={node.id} node={node} onClick={() => router.push(`/docs/architecture/${node.id}`)} />
        ))}

        <text x="650" y="1175" fill="rgb(253 230 138 / 0.62)" fontSize="13">OutputHead runs after ShouldHalt selects the exit; plasticity remains a parallel model-internal path for later deep dive.</text>
      </svg>
    </div>
  );
}
