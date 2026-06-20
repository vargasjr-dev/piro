"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type W = number[][] | number[];
type Weights = Record<string, W>;

function is2D(w: W): w is number[][] {
  return Array.isArray((w as number[][])[0]);
}

function tensorShape(w: W): [number, number] {
  if (is2D(w)) return [(w as number[][]).length, (w as number[][])[0].length];
  return [1, (w as number[]).length];
}

function tensorRows(w: W): number[][] {
  if (is2D(w)) return w as number[][];
  return [w as number[]];
}

// ── Color scale ───────────────────────────────────────────────────────────────
// Diverging: negative → blue, zero → near-black, positive → amber

function valueToColor(v: number, absMax: number): string {
  const t = Math.max(-1, Math.min(1, v / (absMax || 1)));
  if (t < 0) {
    const s = Math.abs(t);
    return `rgb(${Math.round(s * 30)},${Math.round(s * 56)},${Math.round(s * 140)})`;
  }
  return `rgb(${Math.round(t * 200)},${Math.round(t * 80)},${Math.round(t * 10)})`;
}

function absMaxOf(weights: Weights): number {
  let m = 0;
  for (const w of Object.values(weights)) {
    for (const row of tensorRows(w)) {
      for (const v of row) if (Math.abs(v) > m) m = Math.abs(v);
    }
  }
  return m || 1;
}

function absMaxOfTensor(w: W): number {
  let m = 0;
  for (const row of tensorRows(w)) for (const v of row) if (Math.abs(v) > m) m = Math.abs(v);
  return m || 1;
}

// ── Group keys by module prefix ───────────────────────────────────────────────

function groupOf(key: string): string {
  const parts = key.split(".");
  // "layers.0.ln1.weight" → "layers.0"
  if (parts[0] === "layers" && parts.length > 1) return `${parts[0]}.${parts[1]}`;
  return parts[0];
}

function shortKey(key: string, group: string): string {
  return key.startsWith(group + ".") ? key.slice(group.length + 1) : key;
}

function buildGroups(weights: Weights): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const key of Object.keys(weights)) {
    const g = groupOf(key);
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(key);
  }
  return map;
}

// ── Mini heatmap (thumbnail inside a group panel) ─────────────────────────────

function MiniHeatmap({
  w, absMax, selected, onClick,
}: {
  w: W; absMax: number; selected: boolean; onClick: () => void;
}) {
  const [rows, cols] = tensorShape(w);
  const cellPx = Math.max(3, Math.min(8, Math.floor(56 / Math.max(rows, cols))));
  const localMax = absMaxOfTensor(w);

  return (
    <button
      onClick={onClick}
      className={`rounded border transition-colors p-1 ${
        selected
          ? "border-orange-500/50 bg-orange-500/8"
          : "border-amber-900/20 hover:border-amber-700/35"
      }`}
    >
      <svg
        width={cols * cellPx}
        height={rows * cellPx}
        style={{ display: "block" }}
      >
        {tensorRows(w).map((row, ri) =>
          row.map((v, ci) => (
            <rect
              key={`${ri}-${ci}`}
              x={ci * cellPx}
              y={ri * cellPx}
              width={cellPx}
              height={cellPx}
              fill={valueToColor(v, localMax)}
            />
          ))
        )}
      </svg>
    </button>
  );
}

// ── Full heatmap ──────────────────────────────────────────────────────────────

function FullHeatmap({ tensorKey, w }: { tensorKey: string; w: W }) {
  const [hover, setHover] = useState<{ r: number; c: number; v: number } | null>(null);
  const [rows, cols] = tensorShape(w);
  const localMax = absMaxOfTensor(w);
  // Cell size: fit within 320px, min 4, max 24
  const cellPx = Math.max(4, Math.min(24, Math.floor(320 / Math.max(rows, cols))));
  const totalW = cols * cellPx;
  const totalH = rows * cellPx;

  return (
    <div className="mt-3 space-y-2">
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <code className="text-xs font-mono text-orange-400/70">{tensorKey}</code>
        <span className="text-[10px] text-amber-700/35 font-mono">
          {rows === 1 ? `(${cols},)` : `(${rows}, ${cols})`}
        </span>
        <span className="text-[10px] text-amber-800/30 font-mono">
          range [{-localMax.toFixed(3)}, {localMax.toFixed(3)}]
        </span>
      </div>

      {/* Heatmap + hover value */}
      <div className="flex items-start gap-3">
        <svg
          width={totalW}
          height={totalH}
          style={{ display: "block", cursor: "crosshair" }}
          onMouseLeave={() => setHover(null)}
        >
          {tensorRows(w).map((row, ri) =>
            row.map((v, ci) => (
              <rect
                key={`${ri}-${ci}`}
                x={ci * cellPx}
                y={ri * cellPx}
                width={cellPx}
                height={cellPx}
                fill={valueToColor(v, localMax)}
                stroke={
                  hover?.r === ri && hover?.c === ci
                    ? "rgba(251,191,36,0.8)"
                    : "none"
                }
                strokeWidth={1}
                onMouseEnter={() => setHover({ r: ri, c: ci, v })}
              />
            ))
          )}
        </svg>

        {/* Hover readout */}
        <div className="text-[10px] font-mono text-amber-600/50 min-w-[80px] pt-0.5">
          {hover ? (
            <>
              <p className="text-amber-400/60">{hover.v.toFixed(6)}</p>
              {rows > 1 && (
                <p className="text-amber-800/40">
                  [{hover.r}, {hover.c}]
                </p>
              )}
              {rows === 1 && (
                <p className="text-amber-800/40">[{hover.c}]</p>
              )}
            </>
          ) : (
            <p className="text-amber-800/25 italic">hover cell</p>
          )}
        </div>
      </div>

      {/* Color scale legend */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-amber-800/30">
          {(-localMax).toFixed(3)}
        </span>
        <svg width={80} height={6}>
          <defs>
            <linearGradient id={`grad-${tensorKey.replace(/\W/g, "")}`} x1="0" x2="1">
              <stop offset="0%" stopColor={valueToColor(-localMax, localMax)} />
              <stop offset="50%" stopColor="rgb(5,3,0)" />
              <stop offset="100%" stopColor={valueToColor(localMax, localMax)} />
            </linearGradient>
          </defs>
          <rect width={80} height={6} rx={2}
            fill={`url(#grad-${tensorKey.replace(/\W/g, "")})`} />
        </svg>
        <span className="text-[9px] font-mono text-amber-800/30">
          {localMax.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

// ── Group panel ───────────────────────────────────────────────────────────────

function GroupPanel({
  group, keys, weights, absMax, activeTensor, onSelectTensor,
}: {
  group: string;
  keys: string[];
  weights: Weights;
  absMax: number;
  activeTensor: string | null;
  onSelectTensor: (key: string | null) => void;
}) {
  return (
    <div className="mt-3 border border-amber-900/20 rounded-xl p-3 space-y-3 bg-amber-950/20">
      {/* Tensor thumbnails */}
      <div className="flex flex-wrap gap-2">
        {keys.map((key) => {
          const w = weights[key];
          const [rows, cols] = tensorShape(w);
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <MiniHeatmap
                w={w}
                absMax={absMax}
                selected={activeTensor === key}
                onClick={() => onSelectTensor(activeTensor === key ? null : key)}
              />
              <span className="text-[9px] font-mono text-amber-800/40 max-w-[64px] truncate text-center">
                {shortKey(key, group)}
              </span>
              <span className="text-[9px] font-mono text-amber-900/30">
                {rows === 1 ? `${cols}` : `${rows}×${cols}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Full heatmap for selected tensor */}
      {activeTensor && weights[activeTensor] && (
        <FullHeatmap tensorKey={activeTensor} w={weights[activeTensor]} />
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function WeightGraph({ weightsJson }: { weightsJson: string | null }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeTensor, setActiveTensor] = useState<string | null>(null);

  if (!weightsJson) {
    return (
      <p className="text-[11px] text-amber-800/30 italic py-4 text-center">
        No weights stored — retrain this model to visualize.
      </p>
    );
  }

  let weights: Weights;
  try {
    weights = JSON.parse(weightsJson) as Weights;
  } catch {
    return <p className="text-[11px] text-red-400/40">Failed to parse weights JSON.</p>;
  }

  const groups = buildGroups(weights);
  const groupNames = [...groups.keys()];
  const absMax = absMaxOf(weights);

  function handleSelectGroup(g: string) {
    if (activeGroup === g) {
      setActiveGroup(null);
      setActiveTensor(null);
    } else {
      setActiveGroup(g);
      setActiveTensor(null);
    }
  }

  function handleSelectTensor(key: string | null) {
    setActiveTensor(key);
  }

  return (
    <div className="space-y-0">
      {/* Node-edge row */}
      <div className="flex items-center flex-wrap gap-1">
        {groupNames.map((g, i) => {
          const keys = groups.get(g)!;
          const paramCount = keys.reduce((sum, k) => {
            const [r, c] = tensorShape(weights[k]);
            return sum + r * c;
          }, 0);
          const isActive = activeGroup === g;

          return (
            <div key={g} className="flex items-center gap-1">
              {i > 0 && (
                <svg width={16} height={10} className="shrink-0">
                  <path d="M2 5h8M8 2l4 3-4 3"
                    stroke="rgba(120,53,15,0.4)" strokeWidth={1.5}
                    strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              )}
              <button
                onClick={() => handleSelectGroup(g)}
                className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                  isActive
                    ? "border-orange-500/50 bg-orange-500/10 text-amber-200/80"
                    : "border-amber-900/25 bg-amber-900/8 text-amber-400/55 hover:border-amber-700/35 hover:text-amber-300/70"
                }`}
              >
                <p className="text-[10px] font-mono font-semibold leading-tight">{g}</p>
                <p className="text-[9px] font-mono text-amber-800/40 leading-tight">
                  {paramCount}p · {keys.length}t
                </p>
              </button>
            </div>
          );
        })}
      </div>

      {/* Expanded group */}
      {activeGroup && (
        <GroupPanel
          group={activeGroup}
          keys={groups.get(activeGroup)!}
          weights={weights}
          absMax={absMax}
          activeTensor={activeTensor}
          onSelectTensor={handleSelectTensor}
        />
      )}
    </div>
  );
}
