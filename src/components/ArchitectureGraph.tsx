"use client";

import { Fragment } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GraphNodeType =
  | "io"
  | "norm"
  | "attention"
  | "ffn"
  | "residual"
  | "pool"
  | "linear"
  | "loop"
  | "confidence"
  | "sync"
  | "reshape";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  detail?: string;
  /** Consecutive nodes with the same group are bracketed together. */
  group?: string;
  /** Interior nodes — only used when type === "loop". */
  nodes?: GraphNode[];
}

export interface ArchitectureGraphData {
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string }>;
}

// ── Node style map ────────────────────────────────────────────────────────────

interface NodeMeta {
  icon: string;
  textColor: string;
  borderColor: string;
  bgColor: string;
}

const NODE_META: Record<GraphNodeType, NodeMeta> = {
  io:         { icon: "◈", textColor: "text-amber-300",    borderColor: "border-amber-400/40", bgColor: "bg-amber-400/10" },
  norm:       { icon: "≡", textColor: "text-amber-600/60", borderColor: "border-amber-900/20", bgColor: "bg-transparent"  },
  attention:  { icon: "⬡", textColor: "text-amber-300",    borderColor: "border-amber-400/30", bgColor: "bg-amber-400/5"  },
  ffn:        { icon: "⊞", textColor: "text-amber-400/70", borderColor: "border-amber-900/20", bgColor: "bg-transparent"  },
  residual:   { icon: "⊕", textColor: "text-amber-700/50", borderColor: "border-amber-900/10", bgColor: "bg-transparent"  },
  pool:       { icon: "⊙", textColor: "text-amber-500/70", borderColor: "border-amber-900/20", bgColor: "bg-transparent"  },
  linear:     { icon: "▶", textColor: "text-amber-500/60", borderColor: "border-amber-900/20", bgColor: "bg-transparent"  },
  loop:       { icon: "↺", textColor: "text-amber-300",    borderColor: "border-amber-400/30", bgColor: "bg-amber-400/5"  },
  confidence: { icon: "◎", textColor: "text-amber-400/70", borderColor: "border-amber-900/20", bgColor: "bg-transparent"  },
  sync:       { icon: "⊗", textColor: "text-amber-500/60", borderColor: "border-amber-900/20", bgColor: "bg-transparent"  },
  reshape:    { icon: "↔", textColor: "text-amber-500/60", borderColor: "border-amber-900/20", bgColor: "bg-transparent"  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function NodeCard({ node }: { node: GraphNode }) {
  const meta = NODE_META[node.type] ?? NODE_META.linear;
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${meta.borderColor} ${meta.bgColor}`}
    >
      <span
        className={`text-sm font-mono ${meta.textColor} shrink-0 w-4 text-center select-none`}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${meta.textColor}`}>{node.label}</p>
        {node.detail && (
          <p className="text-[10px] font-mono text-amber-700/40 mt-0.5 truncate">
            {node.detail}
          </p>
        )}
      </div>
    </div>
  );
}

/** Vertical arrow connector between top-level sections. */
function Connector() {
  return (
    <div className="flex flex-col items-center py-0.5">
      <div className="w-px h-3 bg-amber-900/30" />
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        className="fill-amber-900/30"
        aria-hidden
      >
        <path d="M4 5L0 0h8z" />
      </svg>
    </div>
  );
}

/** Grouped nodes share a bracket with a header label. */
function GroupSection({
  group,
  nodes,
}: {
  group: string;
  nodes: GraphNode[];
}) {
  return (
    <div className="rounded-xl border border-amber-900/25 overflow-hidden">
      <div className="px-3 py-1.5 bg-amber-900/10 border-b border-amber-900/15">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-amber-700/40">
          {group}
        </span>
      </div>
      <div className="divide-y divide-amber-900/10">
        {nodes.map((node) => (
          <NodeCard key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

/** Loop nodes render as a dashed section with interior steps. */
function LoopSection({ node }: { node: GraphNode }) {
  const interior = node.nodes ?? [];
  return (
    <div className="rounded-xl border border-dashed border-amber-400/25 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 bg-amber-400/5 border-b border-dashed border-amber-400/20 flex items-center gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-amber-400/60">
          ↺ {node.label}
        </span>
        {node.detail && (
          <span className="text-[9px] font-mono text-amber-700/30 truncate">
            {node.detail}
          </span>
        )}
      </div>
      {/* Interior nodes */}
      <div className="px-2 py-2 flex flex-col">
        {interior.map((n, i) => (
          <Fragment key={n.id}>
            {i > 0 && <Connector />}
            <NodeCard node={n} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Segmentation ──────────────────────────────────────────────────────────────

type Segment =
  | { kind: "single"; node: GraphNode }
  | { kind: "group"; group: string; nodes: GraphNode[] };

/**
 * Collapse consecutive nodes with the same ``group`` label into one segment.
 * Loop-type nodes always form their own segment regardless of group.
 */
function segmentNodes(nodes: GraphNode[]): Segment[] {
  const segments: Segment[] = [];
  for (const node of nodes) {
    // Loop nodes are self-contained — never merged into a group
    if (node.type === "loop") {
      segments.push({ kind: "single", node });
      continue;
    }
    if (node.group) {
      const last = segments[segments.length - 1];
      if (last?.kind === "group" && last.group === node.group) {
        last.nodes.push(node);
        continue;
      }
      segments.push({ kind: "group", group: node.group, nodes: [node] });
    } else {
      segments.push({ kind: "single", node });
    }
  }
  return segments;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ArchitectureGraph({ graph }: { graph: ArchitectureGraphData }) {
  const segments = segmentNodes(graph.nodes);

  return (
    <div className="flex flex-col">
      {segments.map((seg, i) => {
        const key =
          seg.kind === "group" ? `group:${seg.group}` : `node:${seg.node.id}`;
        return (
          <Fragment key={key}>
            {i > 0 && <Connector />}
            {seg.kind === "single" && seg.node.type === "loop" ? (
              <LoopSection node={seg.node} />
            ) : seg.kind === "group" ? (
              <GroupSection group={seg.group} nodes={seg.nodes} />
            ) : (
              <NodeCard node={seg.node} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
