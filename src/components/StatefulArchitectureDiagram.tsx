"use client";

import { useState } from "react";

type NodeStatus = "implemented" | "designed" | "external" | "learning";

type DiagramNode = {
  id: string;
  title: string;
  detail: string;
  status: NodeStatus;
  x: number;
  y: number;
  width?: number;
};

const nodes: DiagramNode[] = [
  {
    id: "observation",
    title: "Observation",
    detail: "tokens · tools · world",
    status: "external",
    x: 24,
    y: 286,
    width: 176,
  },
  {
    id: "embedding",
    title: "Input embedding",
    detail: "semantic representation",
    status: "implemented",
    x: 236,
    y: 286,
    width: 176,
  },
  {
    id: "ctm",
    title: "CTM core",
    detail: "neuron state · history · sync attention · repeated ticks",
    status: "implemented",
    x: 470,
    y: 220,
    width: 292,
  },
  {
    id: "policy",
    title: "Policy / output head",
    detail: "token · tool call · environment action",
    status: "implemented",
    x: 824,
    y: 286,
    width: 196,
  },
  {
    id: "environment",
    title: "Environment",
    detail: "user · tools · tests · game",
    status: "external",
    x: 1064,
    y: 286,
    width: 176,
  },
  {
    id: "prediction",
    title: "Pending prediction",
    detail: "what did I expect to happen?",
    status: "designed",
    x: 256,
    y: 516,
    width: 202,
  },
  {
    id: "eligibility",
    title: "Eligibility trace",
    detail: "which recent actions can earn credit?",
    status: "designed",
    x: 494,
    y: 516,
    width: 220,
  },
  {
    id: "consequence",
    title: "Later consequence",
    detail: "ordinary observation, not a required verifier",
    status: "external",
    x: 756,
    y: 516,
    width: 218,
  },
  {
    id: "error",
    title: "Prediction + value error",
    detail: "what happened vs. what was expected",
    status: "learning",
    x: 1016,
    y: 516,
    width: 220,
  },
  {
    id: "credit",
    title: "Hindsight credit",
    detail: "attribute the consequence to earlier decisions",
    status: "learning",
    x: 618,
    y: 650,
    width: 236,
  },
  {
    id: "fast",
    title: "Fast task adapter",
    detail: "belief · plan · value · optional fast weights",
    status: "learning",
    x: 900,
    y: 650,
    width: 240,
  },
  {
    id: "consolidation",
    title: "Replay + consolidation",
    detail: "repeated evidence → durable training",
    status: "designed",
    x: 330,
    y: 650,
    width: 236,
  },
];

const arrows = [
  { d: "M200 324 H236", kind: "primary" },
  { d: "M412 324 H470", kind: "primary" },
  { d: "M762 324 H824", kind: "primary" },
  { d: "M1020 324 H1064", kind: "primary" },
  { d: "M920 364 V470 H865 V516", kind: "external" },
  { d: "M545 364 V470 H357 V516", kind: "designed" },
  { d: "M616 364 V470 H604 V516", kind: "designed" },
  { d: "M974 560 H1016", kind: "learning" },
  { d: "M865 560 V620 H736 V650", kind: "learning" },
  { d: "M714 560 V620 H736 V650", kind: "learning" },
  { d: "M458 560 V620 H448 V650", kind: "designed" },
  { d: "M854 694 H900", kind: "learning" },
  { d: "M1020 650 V416 H920 V364", kind: "feedback" },
  { d: "M900 694 H180 V324 H200", kind: "feedback" },
];

const statusMeta: Record<
  NodeStatus,
  { label: string; className: string; line: string }
> = {
  implemented: {
    label: "Implemented",
    className: "border-emerald-400/35 bg-emerald-400/[0.07] text-emerald-200",
    line: "stroke-emerald-300/60",
  },
  designed: {
    label: "Designed",
    className: "border-sky-400/35 bg-sky-400/[0.07] text-sky-200",
    line: "stroke-sky-300/60",
  },
  external: {
    label: "Environment",
    className: "border-fuchsia-400/35 bg-fuchsia-400/[0.07] text-fuchsia-200",
    line: "stroke-fuchsia-300/60",
  },
  learning: {
    label: "Learning",
    className: "border-orange-300/40 bg-orange-300/[0.08] text-orange-100",
    line: "stroke-orange-300/70",
  },
};

function DiagramCard({
  node,
  selected,
  onSelect,
}: {
  node: DiagramNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = statusMeta[node.status];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`absolute text-left rounded-2xl border px-4 py-3 transition focus:outline-none focus:ring-2 focus:ring-orange-300/70 ${meta.className} ${selected ? "ring-2 ring-orange-300/80 shadow-[0_0_28px_rgba(251,146,60,0.16)]" : "hover:-translate-y-0.5 hover:border-orange-200/60"}`}
      style={{ left: node.x, top: node.y, width: node.width ?? 190 }}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-amber-50">{node.title}</span>
        <span className="text-[9px] uppercase tracking-wider opacity-65">{meta.label}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-200/55">{node.detail}</p>
    </button>
  );
}

export default function StatefulArchitectureDiagram() {
  const [selectedId, setSelectedId] = useState("credit");
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#100c0a] p-4 md:p-6">
        <div className="relative h-[760px] min-w-[1260px]">
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 1260 760"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <marker id="arrow-primary" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0 0L8 4L0 8Z" fill="rgb(251 191 36 / 0.6)" />
              </marker>
              <marker id="arrow-learning" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0 0L8 4L0 8Z" fill="rgb(253 186 116 / 0.7)" />
              </marker>
              <marker id="arrow-feedback" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0 0L8 4L0 8Z" fill="rgb(125 211 252 / 0.65)" />
              </marker>
              <marker id="arrow-designed" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0 0L8 4L0 8Z" fill="rgb(125 211 252 / 0.6)" />
              </marker>
              <marker id="arrow-external" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0 0L8 4L0 8Z" fill="rgb(232 121 249 / 0.65)" />
              </marker>
            </defs>
            <path d="M24 142 H1236" stroke="rgb(251 191 36 / 0.08)" strokeDasharray="5 8" />
            <text x="24" y="126" fill="rgb(251 191 36 / 0.38)" fontSize="12" letterSpacing="2">ACT / PREDICT</text>
            <path d="M24 460 H1236" stroke="rgb(251 191 36 / 0.08)" strokeDasharray="5 8" />
            <text x="24" y="444" fill="rgb(251 191 36 / 0.38)" fontSize="12" letterSpacing="2">ENCOUNTER CONSEQUENCES</text>
            <path d="M24 620 H1236" stroke="rgb(251 191 36 / 0.08)" strokeDasharray="5 8" />
            <text x="24" y="604" fill="rgb(251 191 36 / 0.38)" fontSize="12" letterSpacing="2">ASSIGN CREDIT / ADAPT / CONSOLIDATE</text>
            {arrows.map((arrow, index) => (
              <path
                key={`${arrow.kind}-${index}`}
                d={arrow.d}
                className={
                  arrow.kind === "primary"
                    ? "stroke-amber-300/60"
                    : arrow.kind === "learning"
                      ? "stroke-orange-300/70"
                      : arrow.kind === "feedback"
                        ? "stroke-sky-300/65"
                        : arrow.kind === "external"
                          ? "stroke-fuchsia-300/65"
                          : "stroke-sky-300/60"
                }
                strokeWidth="1.5"
                strokeDasharray={arrow.kind === "feedback" || arrow.kind === "designed" ? "6 5" : undefined}
                markerEnd={`url(#arrow-${arrow.kind === "primary" ? "primary" : arrow.kind})`}
              />
            ))}
            <path d="M470 190 C470 160 762 160 762 190" className="stroke-emerald-300/50" strokeWidth="1.5" strokeDasharray="6 5" markerEnd="url(#arrow-primary)" />
            <text x="558" y="174" fill="rgb(167 243 208 / 0.55)" fontSize="11">repeated internal thought ticks</text>
          </svg>

          {nodes.map((node) => (
            <DiagramCard
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              onSelect={() => setSelectedId(node.id)}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 rounded-2xl border border-amber-900/25 bg-amber-950/20 p-5 md:grid-cols-[180px_1fr] md:items-start">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300/70">Selected module</p>
          <p className="mt-2 text-lg font-semibold text-amber-50">{selected.title}</p>
          <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider ${statusMeta[selected.status].className}`}>
            {statusMeta[selected.status].label}
          </span>
        </div>
        <div className="text-sm leading-7 text-amber-200/65">
          {selected.id === "credit" ? (
            <>
              Later consequences should not reinforce every token equally. This
              module combines fading eligibility with hindsight attribution so
              the model can ask which earlier decision materially contributed to
              the outcome.
            </>
          ) : selected.id === "ctm" ? (
            <>
              This is the current Piro research core: neuron state accumulates
              over internal ticks, history is retained, and synchronization
              drives attention before the output is committed.
            </>
          ) : selected.id === "fast" ? (
            <>
              Task-local adaptation belongs here first. It may eventually be a
              small adapter, a learned memory module, or fast weights—but it
              should be isolated from durable model weights.
            </>
          ) : (
            <>
              This is a working design element, not a finished implementation.
              The next experiments should determine what state it owns and what
              signal is strong enough to update it.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
