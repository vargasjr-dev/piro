"use client";

import { useState } from "react";

// ── Config + param math ───────────────────────────────────────────────────────

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

function computeParams(cfg: CTMConfig) {
  const { n_neurons: N, embed_dim: D, query_dim: Q, value_dim: V, hidden_dim: H, n_classes: C } = cfg;
  const N2 = N * N;
  // SyncAttention
  const wq = N2 * Q;       // sync matrix rows → queries
  const wk = D * Q;        // embeddings → keys
  const wv = D * V;        // embeddings → values
  const wo = V * D;        // attended values → embedding space
  const syncAttn = wq + wk + wv + wo;
  // ConfidenceHead: fc1(N²→H) + bias + fc2(H→1) + bias
  const confHead = N2 * H + H + H * 1 + 1;
  // OutputHead: fc1(N²→H) + bias + fc2(H→C) + bias
  const outHead = N2 * H + H + H * C + C;
  return {
    syncAttn, confHead, outHead,
    total: syncAttn + confHead + outHead,
    detail: {
      syncAttn: { wq, wk, wv, wo },
      confHead: { fc1: N2 * H + H, fc2: H * 1 + 1 },
      outHead:  { fc1: N2 * H + H, fc2: H * C + C },
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function P({ n }: { n: number }) {
  return (
    <span className="text-[10px] font-mono text-amber-500/50 shrink-0">
      {n.toLocaleString()}p
    </span>
  );
}

function Arrow({ loop }: { loop?: boolean }) {
  return (
    <div className="flex flex-col items-center py-0.5 gap-0.5">
      {loop && (
        <span className="text-[9px] text-amber-700/30 font-mono italic">× up to N ticks</span>
      )}
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
        <path d="M6 1v10M3 9l3 4 3-4" stroke="rgba(146,64,14,0.35)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Param explainer ───────────────────────────────────────────────────────────

function ParamExplainer({ total, bytes }: { total: number; bytes: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-amber-900/20 bg-amber-950/30 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-amber-900/10 transition-colors"
      >
        <span className="text-[10px] text-amber-500/50 uppercase tracking-wider font-semibold">
          What is a parameter?
        </span>
        <span className="text-[9px] text-amber-700/35">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-amber-900/15">
          <p className="text-[11px] text-amber-400/60 leading-relaxed pt-2">
            A <strong className="text-amber-300/70">parameter</strong> is one learned floating-point number stored as float32 (4 bytes). During training, gradient descent adjusts every parameter to minimize cross-entropy loss.
          </p>
          <p className="text-[11px] text-amber-400/60 leading-relaxed">
            A weight matrix <code className="text-amber-300/60 font-mono">W(A×B)</code> contributes <code className="text-amber-300/60 font-mono">A×B</code> parameters — one number per cell. A bias vector <code className="text-amber-300/60 font-mono">b(N)</code> contributes N parameters.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <div className="text-center">
              <p className="text-base font-mono font-bold text-amber-300/70">{total.toLocaleString()}</p>
              <p className="text-[9px] text-amber-700/40">parameters</p>
            </div>
            <div className="text-amber-700/30">×</div>
            <div className="text-center">
              <p className="text-base font-mono font-bold text-amber-300/70">4</p>
              <p className="text-[9px] text-amber-700/40">bytes each</p>
            </div>
            <div className="text-amber-700/30">=</div>
            <div className="text-center">
              <p className="text-base font-mono font-bold text-amber-300/70">{bytes.toLocaleString()}</p>
              <p className="text-[9px] text-amber-700/40">bytes ({(bytes / 1024).toFixed(1)} KB)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weight matrix row ─────────────────────────────────────────────────────────

function MatrixRow({ name, fromDim, toDim, params, desc }: {
  name: string; fromDim: string; toDim: string; params: number; desc?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-amber-900/10 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <code className="text-[11px] font-mono text-orange-400/70">{name}</code>
          <span className="text-[10px] text-amber-700/30">({fromDim} → {toDim})</span>
        </div>
        {desc && <p className="text-[10px] text-amber-700/35 mt-0.5 leading-relaxed">{desc}</p>}
        <p className="text-[9px] text-amber-800/30 mt-0.5 font-mono">
          {fromDim} × {toDim} cells
        </p>
      </div>
      <P n={params} />
    </div>
  );
}

// ── Static neuron ring SVG (no animation) ─────────────────────────────────────

function NeuronRing({ n }: { n: number }) {
  const CX = 72, CY = 72, RING_R = 42, R = 12;
  const neurons = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: CX + RING_R * Math.cos(angle), y: CY + RING_R * Math.sin(angle) };
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j]);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={144} height={144} className="overflow-visible">
        {edges.map(([i, j]) => (
          <line key={`${i}-${j}`}
            x1={neurons[i].x} y1={neurons[i].y}
            x2={neurons[j].x} y2={neurons[j].y}
            stroke="rgba(251,146,60,0.12)" strokeWidth={1.5}
          />
        ))}
        {neurons.map((neu, i) => (
          <g key={i}>
            <circle cx={neu.x} cy={neu.y} r={R}
              fill="#1a0a00" stroke="rgba(251,146,60,0.35)" strokeWidth={1.5} />
            <text x={neu.x} y={neu.y + 4} textAnchor="middle"
              fontSize={9} fill="rgba(251,146,60,0.5)" fontFamily="monospace">
              N{i}
            </text>
          </g>
        ))}
        <text x={CX} y={CY - 5} textAnchor="middle" fontSize={7}
          fill="rgba(251,146,60,0.2)" fontFamily="monospace">SYNC</text>
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize={7}
          fill="rgba(251,146,60,0.2)" fontFamily="monospace">{n}×{n}</text>
      </svg>
      <p className="text-[9px] text-amber-800/35 text-center">
        {n} neurons · {n * n} sync matrix cells
      </p>
    </div>
  );
}

// ── Flow blocks ───────────────────────────────────────────────────────────────

function InputBlock({ cfg }: { cfg: CTMConfig }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
          open ? "border-amber-700/35 bg-amber-900/15" : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-200/60">Input Embeddings</span>
          <span className="text-[10px] text-amber-700/30">0p · no weights</span>
        </div>
        <p className="text-[10px] text-amber-700/40 mt-0.5">
          {cfg.n_neurons} positions × {cfg.embed_dim}d one-hot encoding
        </p>
      </button>
      {open && (
        <div className="mt-1.5 mx-1 px-3 py-2.5 rounded-lg border border-amber-900/15 bg-amber-950/20 space-y-1.5">
          <p className="text-[11px] text-amber-400/60 leading-relaxed">
            Each of the {cfg.n_neurons} input values is encoded as a one-hot vector of length {cfg.embed_dim}: position <code className="font-mono text-amber-300/60">min(value, {cfg.embed_dim - 1})</code> is set to 1.0, all others 0.
          </p>
          <p className="text-[11px] text-amber-400/60 leading-relaxed">
            No learned parameters here — this is pure data encoding. The input tensor is shape <code className="font-mono text-amber-300/60">({cfg.n_neurons}, {cfg.embed_dim})</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function SyncAttnBlock({ cfg, params }: { cfg: CTMConfig; params: ReturnType<typeof computeParams> }) {
  const [open, setOpen] = useState(false);
  const { N2, Q, D, V } = {
    N2: cfg.n_neurons ** 2, Q: cfg.query_dim, D: cfg.embed_dim, V: cfg.value_dim
  };
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
          open ? "border-orange-500/40 bg-orange-500/8" : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-200/70">SyncAttention</span>
          <P n={params.syncAttn} />
        </div>
        <p className="text-[10px] text-amber-700/40 mt-0.5">
          Queries from sync matrix · Keys & Values from embeddings
        </p>
      </button>
      {open && (
        <div className="mt-1.5 mx-1 px-3 py-2.5 rounded-lg border border-orange-900/20 bg-orange-950/10 space-y-1">
          <p className="text-[11px] text-amber-400/60 leading-relaxed pb-1">
            Unlike standard self-attention, the <em>query</em> comes from the {cfg.n_neurons}×{cfg.n_neurons} sync matrix (flattened to {N2}d), not the input. This lets each neuron "ask" about the others based on how synchronized they currently are.
          </p>
          <MatrixRow name="W_q" fromDim={`${N2}`} toDim={`${Q}`}
            params={params.detail.syncAttn.wq}
            desc={`Projects flattened sync matrix (${N2}d) into queries`} />
          <MatrixRow name="W_k" fromDim={`${D}`} toDim={`${Q}`}
            params={params.detail.syncAttn.wk}
            desc="Projects input embeddings into keys" />
          <MatrixRow name="W_v" fromDim={`${D}`} toDim={`${V}`}
            params={params.detail.syncAttn.wv}
            desc="Projects input embeddings into values" />
          <MatrixRow name="W_o" fromDim={`${V}`} toDim={`${D}`}
            params={params.detail.syncAttn.wo}
            desc="Projects attended values back to embedding space" />
        </div>
      )}
    </div>
  );
}

function TickLoopBlock({ cfg, params }: { cfg: CTMConfig; params: ReturnType<typeof computeParams> }) {
  const [open, setOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState<"conf" | null>(null);
  const maxTicks = cfg.max_ticks ?? 10;
  const confThresh = cfg.confidence_threshold ?? 0.8;
  const N2 = cfg.n_neurons ** 2;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
          open ? "border-amber-700/35 bg-amber-900/15" : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-200/70">TickLoop</span>
            <span className="text-[9px] text-amber-600/35 font-mono">↺</span>
          </div>
          <span className="text-[10px] text-amber-700/30">0p · orchestration only</span>
        </div>
        <p className="text-[10px] text-amber-700/40 mt-0.5">
          Runs SyncAttention + ConfidenceHead up to {maxTicks} times
        </p>
      </button>
      {open && (
        <div className="mt-1.5 mx-1 rounded-lg border border-amber-900/15 bg-amber-950/20 overflow-hidden">
          <div className="px-3 py-2.5 space-y-2 border-b border-amber-900/10">
            <p className="text-[11px] text-amber-400/60 leading-relaxed">
              Each tick: run SyncAttention → update embeddings → recompute sync matrix via Pearson correlation → ask ConfidenceHead whether to stop.
              Exits when confidence ≥ {confThresh} or after {maxTicks} ticks. The sync matrix starts as the identity.
            </p>
            <div className="flex gap-3 pt-0.5">
              <NeuronRing n={cfg.n_neurons} />
              <div className="flex-1 space-y-2 text-[10px] text-amber-700/40 pt-1">
                <p>The <strong className="text-amber-500/50">sync matrix</strong> is {cfg.n_neurons}×{cfg.n_neurons} = {N2} values — one per neuron pair.</p>
                <p>Each cell is the Pearson correlation of two neurons' activation histories. High sync = neurons agree.</p>
                <p>It's not a weight matrix — it's recomputed every tick from activations.</p>
              </div>
            </div>
          </div>
          {/* ConfidenceHead nested */}
          <div className="px-3 py-2">
            <button
              onClick={() => setInnerOpen(v => v === "conf" ? null : "conf")}
              className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors text-[11px] ${
                innerOpen === "conf" ? "border-amber-700/30 bg-amber-900/15" : "border-amber-900/15 bg-amber-900/5 hover:bg-amber-900/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-200/60">ConfidenceHead</span>
                <P n={params.confHead} />
              </div>
              <p className="text-[10px] text-amber-700/35 mt-0.5">sync({cfg.n_neurons}×{cfg.n_neurons}) → scalar confidence</p>
            </button>
            {innerOpen === "conf" && (
              <div className="mt-1.5 ml-2 px-2.5 py-2 rounded border border-amber-900/15 bg-amber-950/20 space-y-0.5">
                <MatrixRow name="fc1 + bias" fromDim={`${N2}`} toDim={`${cfg.hidden_dim}`}
                  params={params.detail.confHead.fc1}
                  desc="Reads flattened sync matrix" />
                <MatrixRow name="fc2 + bias" fromDim={`${cfg.hidden_dim}`} toDim="1"
                  params={params.detail.confHead.fc2}
                  desc="Outputs scalar in [0,1] via sigmoid" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputHeadBlock({ cfg, params }: { cfg: CTMConfig; params: ReturnType<typeof computeParams> }) {
  const [open, setOpen] = useState(false);
  const N2 = cfg.n_neurons ** 2;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
          open ? "border-orange-500/40 bg-orange-500/8" : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-200/70">OutputHead</span>
          <P n={params.outHead} />
        </div>
        <p className="text-[10px] text-amber-700/40 mt-0.5">
          Final sync matrix → {cfg.n_classes} class logits
        </p>
      </button>
      {open && (
        <div className="mt-1.5 mx-1 px-3 py-2.5 rounded-lg border border-orange-900/20 bg-orange-950/10 space-y-1">
          <p className="text-[11px] text-amber-400/60 leading-relaxed pb-1">
            Reads the final sync matrix (after all ticks) and outputs a probability distribution over {cfg.n_classes} classes. argmax gives the predicted index.
          </p>
          <MatrixRow name="fc1 + bias" fromDim={`${N2}`} toDim={`${cfg.hidden_dim}`}
            params={params.detail.outHead.fc1}
            desc="Reads flattened final sync matrix" />
          <MatrixRow name="fc2 + bias" fromDim={`${cfg.hidden_dim}`} toDim={`${cfg.n_classes}`}
            params={params.detail.outHead.fc2}
            desc={`${cfg.n_classes} logits → softmax → argmax`} />
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CTMDiagram({ configJson }: { configJson: string | null }) {
  const cfg: CTMConfig = (() => {
    try { return { ...defaultCTMConfig(), ...(JSON.parse(configJson ?? "{}") as Partial<CTMConfig>) }; }
    catch { return defaultCTMConfig(); }
  })();

  const params = computeParams(cfg);

  return (
    <div className="space-y-3">
      <ParamExplainer total={params.total} bytes={params.total * 4} />

      <div className="space-y-1">
        <InputBlock cfg={cfg} />
        <Arrow />
        <SyncAttnBlock cfg={cfg} params={params} />
        <Arrow loop />
        <TickLoopBlock cfg={cfg} params={params} />
        <Arrow />
        <OutputHeadBlock cfg={cfg} params={params} />
        <Arrow />
        <div className="px-3 py-2 rounded-lg border border-amber-900/15 bg-amber-900/5 text-center">
          <p className="text-[10px] text-amber-700/35 font-mono">
            {cfg.n_classes} logits → argmax → predicted class
          </p>
        </div>
      </div>
    </div>
  );
}
