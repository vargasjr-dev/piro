"use client";

import { useEffect, useRef, useState } from "react";

interface CTMConfig {
  n_neurons: number;
  embed_dim: number;
  query_dim: number;
  value_dim: number;
  hidden_dim: number;
  n_classes: number;
  max_ticks?: number;
  confidence_threshold?: number;
}

function defaultCTMConfig(): CTMConfig {
  return { n_neurons: 4, embed_dim: 8, query_dim: 8, value_dim: 8, hidden_dim: 16, n_classes: 5 };
}

// Compute param counts matching the Python layer definitions
function computeCTMParams(cfg: CTMConfig) {
  const { n_neurons, embed_dim, query_dim, value_dim, hidden_dim, n_classes } = cfg;
  // SyncAttention: W_q (n²→query_dim), W_k (embed→query_dim), W_v (embed→value_dim), W_o (value_dim→embed)
  const syncAttn = n_neurons * n_neurons * query_dim + embed_dim * query_dim + embed_dim * value_dim + value_dim * embed_dim;
  // ConfidenceHead: fc1 (n²→hidden), fc2 (hidden→1)
  const confHead = n_neurons * n_neurons * hidden_dim + hidden_dim + hidden_dim * 1 + 1;
  // OutputHead: fc1 (n²→hidden), fc2 (hidden→n_classes)
  const outHead = n_neurons * n_neurons * hidden_dim + hidden_dim + hidden_dim * n_classes + n_classes;
  return { syncAttn, confHead, outHead, total: syncAttn + confHead + outHead };
}

interface NeuronProps { cx: number; cy: number; r: number; pulse: number; index: number }

function NeuronNode({ cx, cy, r, pulse, index }: NeuronProps) {
  const glow = 0.3 + pulse * 0.7;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 6} fill={`rgba(251,146,60,${glow * 0.12})`} />
      <circle cx={cx} cy={cy} r={r} fill="#1a0a00" stroke={`rgba(251,146,60,${0.4 + pulse * 0.6})`} strokeWidth={1.5} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fill={`rgba(251,146,60,${0.5 + pulse * 0.5})`} fontFamily="monospace">
        N{index}
      </text>
    </g>
  );
}

export default function CTMDiagram({ configJson }: { configJson: string | null }) {
  const cfg: CTMConfig = (() => {
    try { return { ...defaultCTMConfig(), ...(JSON.parse(configJson ?? "{}") as Partial<CTMConfig>) }; }
    catch { return defaultCTMConfig(); }
  })();

  const params = computeCTMParams(cfg);
  const [tick, setTick] = useState(0);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = performance.now();
    const animate = (now: number) => {
      setTick(now - startRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Neuron ring layout
  const CX = 120, CY = 120, RING_R = 60, NEURON_R = 14;
  const neurons = Array.from({ length: cfg.n_neurons }, (_, i) => {
    const angle = (i / cfg.n_neurons) * Math.PI * 2 - Math.PI / 2;
    return { x: CX + RING_R * Math.cos(angle), y: CY + RING_R * Math.sin(angle), i };
  });

  // Animate pulse: each neuron lights up in sequence during the tick loop
  const tickPeriod = 1200; // ms per full cycle
  const t = (tick % tickPeriod) / tickPeriod; // 0–1
  const neuronPulses = neurons.map((_, i) => {
    const phase = i / cfg.n_neurons;
    const dist = Math.min(Math.abs(t - phase), 1 - Math.abs(t - phase));
    return Math.max(0, 1 - dist * cfg.n_neurons * 1.5);
  });

  // Sync edges — strength pulses around the ring
  const edges: { i: number; j: number; strength: number }[] = [];
  for (let i = 0; i < cfg.n_neurons; i++) {
    for (let j = i + 1; j < cfg.n_neurons; j++) {
      const phase = ((i + j) / (cfg.n_neurons * 2));
      const dist = Math.min(Math.abs(t - phase), 1 - Math.abs(t - phase));
      edges.push({ i, j, strength: Math.max(0.05, 0.6 - dist * 4) });
    }
  }

  const layers = [
    { key: "input", label: "Input Embeddings", sub: `${cfg.n_neurons} × ${cfg.embed_dim}`, params: null, color: "#92400e" },
    { key: "sync_attn", label: "SyncAttention", sub: `Q from sync matrix · K/V from embeddings`, params: params.syncAttn, color: "#c2410c" },
    { key: "tick_loop", label: "TickLoop", sub: `up to ${cfg.max_ticks ?? 10} ticks · stops at confidence ≥ ${cfg.confidence_threshold ?? 0.8}`, params: null, color: "#9a3412" },
    { key: "conf_head", label: "ConfidenceHead", sub: `sync matrix → scalar confidence`, params: params.confHead, color: "#7c2d12" },
    { key: "output_head", label: "OutputHead", sub: `sync matrix → ${cfg.n_classes} classes`, params: params.outHead, color: "#78350f" },
  ];

  return (
    <div className="space-y-6">
      {/* Neuron ring + sync animation */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-[10px] text-amber-600/40 uppercase tracking-widest">Neuron sync animation</p>
        <svg width={240} height={240} className="overflow-visible">
          {/* Sync edges */}
          {edges.map(({ i, j, strength }) => (
            <line
              key={`${i}-${j}`}
              x1={neurons[i].x} y1={neurons[i].y}
              x2={neurons[j].x} y2={neurons[j].y}
              stroke={`rgba(251,146,60,${strength})`}
              strokeWidth={strength * 2.5}
            />
          ))}
          {/* Neurons */}
          {neurons.map((n, i) => (
            <NeuronNode key={i} cx={n.x} cy={n.y} r={NEURON_R} pulse={neuronPulses[i]} index={i} />
          ))}
          {/* Center label */}
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize={8} fill="rgba(251,146,60,0.3)" fontFamily="monospace">SYNC</text>
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize={8} fill="rgba(251,146,60,0.3)" fontFamily="monospace">MATRIX</text>
          <text x={CX} y={CY + 16} textAnchor="middle" fontSize={7} fill="rgba(251,146,60,0.2)" fontFamily="monospace">{cfg.n_neurons}×{cfg.n_neurons}</text>
        </svg>
        <p className="text-[10px] text-amber-700/30">
          Edge opacity = pairwise sync strength · neurons fire in sequence each tick
        </p>
      </div>

      {/* Layer breakdown */}
      <div className="space-y-2">
        <p className="text-[10px] text-amber-600/40 uppercase tracking-widest">Architecture layers</p>
        {layers.map((layer) => (
          <button
            key={layer.key}
            onClick={() => setSelectedLayer(selectedLayer === layer.key ? null : layer.key)}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
              selectedLayer === layer.key
                ? "border-orange-500/40 bg-orange-500/10"
                : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-200/70">{layer.label}</span>
              {layer.params !== null && (
                <span className="text-[10px] font-mono text-amber-500/50">{layer.params.toLocaleString()} p</span>
              )}
            </div>
            <p className="text-[10px] text-amber-700/40 mt-0.5">{layer.sub}</p>
            {selectedLayer === layer.key && layer.key === "sync_attn" && (
              <div className="mt-2 space-y-1 border-t border-amber-900/20 pt-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-amber-700/40">W_q ({cfg.n_neurons}²→{cfg.query_dim})</span>
                  <span className="font-mono text-amber-500/40">{cfg.n_neurons**2 * cfg.query_dim} p</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-amber-700/40">W_k ({cfg.embed_dim}→{cfg.query_dim})</span>
                  <span className="font-mono text-amber-500/40">{cfg.embed_dim * cfg.query_dim} p</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-amber-700/40">W_v ({cfg.embed_dim}→{cfg.value_dim})</span>
                  <span className="font-mono text-amber-500/40">{cfg.embed_dim * cfg.value_dim} p</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-amber-700/40">W_o ({cfg.value_dim}→{cfg.embed_dim})</span>
                  <span className="font-mono text-amber-500/40">{cfg.value_dim * cfg.embed_dim} p</span>
                </div>
              </div>
            )}
            {selectedLayer === layer.key && layer.key === "tick_loop" && (
              <div className="mt-2 border-t border-amber-900/20 pt-2 text-[10px] text-amber-700/40 space-y-0.5">
                <p>No learnable weights — orchestrates SyncAttention + ConfidenceHead</p>
                <p>Runs until confidence ≥ {cfg.confidence_threshold ?? 0.8} or {cfg.max_ticks ?? 10} ticks elapsed</p>
              </div>
            )}
            {selectedLayer === layer.key && (layer.key === "conf_head" || layer.key === "output_head") && (
              <div className="mt-2 space-y-1 border-t border-amber-900/20 pt-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-amber-700/40">fc1 ({cfg.n_neurons}²→{cfg.hidden_dim}) + bias</span>
                  <span className="font-mono text-amber-500/40">{cfg.n_neurons**2 * cfg.hidden_dim + cfg.hidden_dim} p</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-amber-700/40">
                    fc2 ({cfg.hidden_dim}→{layer.key === "conf_head" ? 1 : cfg.n_classes}) + bias
                  </span>
                  <span className="font-mono text-amber-500/40">
                    {layer.key === "conf_head"
                      ? cfg.hidden_dim * 1 + 1
                      : cfg.hidden_dim * cfg.n_classes + cfg.n_classes} p
                  </span>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
