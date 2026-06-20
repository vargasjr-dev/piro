"use client";

import { useState } from "react";

// ── Config + param math ───────────────────────────────────────────────────────

interface TransformerConfig {
  embed_dim: number;
  n_heads: number;
  ffn_dim: number;
  n_layers: number;
  n_classes: number;
}

function defaultCfg(): TransformerConfig {
  return { embed_dim: 8, n_heads: 2, ffn_dim: 6, n_layers: 2, n_classes: 5 };
}

function computeParams(cfg: TransformerConfig) {
  const { embed_dim: D, n_heads: H, ffn_dim: F, n_layers: L, n_classes: C } = cfg;
  const headDim = D / H;
  // Q, K, V projections (per head): head_dim×D each → n_heads total
  const qkv = H * (D * headDim) * 3;
  // Output projection: D×D (no bias in nn.MultiheadAttention with bias=False)
  const attnOut = D * D;
  const mhsa = qkv + attnOut;
  // FFN: Linear(D→F) + bias + Linear(F→D) + bias
  const ffn = D * F + F + F * D + D;
  // Two LayerNorms per layer: scale + bias = D×2 each
  const ln = D * 2;
  const perLayer = mhsa + ffn + ln * 2;
  const totalLayers = perLayer * L;
  // Final LayerNorm
  const lnFinal = D * 2;
  // Output projection: Linear(D→C) + bias
  const outProj = D * C + C;
  return {
    mhsa, ffn, ln, perLayer, totalLayers, lnFinal, outProj,
    total: totalLayers + lnFinal + outProj,
    headDim,
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

function Arrow() {
  return (
    <div className="flex justify-center py-0.5">
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
        <path d="M6 1v10M3 9l3 4 3-4" stroke="rgba(146,64,14,0.35)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

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
      </div>
      <P n={params} />
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

// ── Flow blocks ───────────────────────────────────────────────────────────────

function InputBlock({ cfg }: { cfg: TransformerConfig }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
          open ? "border-amber-700/35 bg-amber-900/15" : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-200/60">Input Embeddings</span>
          <span className="text-[10px] text-amber-700/30">0p · no weights</span>
        </div>
        <p className="text-[10px] text-amber-700/40 mt-0.5">
          seq × {cfg.embed_dim}d · no positional encoding
        </p>
      </button>
      {open && (
        <div className="mt-1.5 mx-1 px-3 py-2.5 rounded-lg border border-amber-900/15 bg-amber-950/20">
          <p className="text-[11px] text-amber-400/60 leading-relaxed">
            Bag of embeddings — sequence order doesn't matter to this model. Each token is a {cfg.embed_dim}d one-hot vector. No positional encoding is added (unlike GPT-style models).
          </p>
        </div>
      )}
    </div>
  );
}

function TransformerLayerBlock({ layerIdx, cfg, params }: {
  layerIdx: number;
  cfg: TransformerConfig;
  params: ReturnType<typeof computeParams>;
}) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState<"mhsa" | "ffn" | null>(null);
  const { embed_dim: D, n_heads: H, ffn_dim: F } = cfg;
  const { headDim } = params;

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
          open ? "border-orange-500/40 bg-orange-500/8" : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-200/70">
            Transformer Layer {layerIdx + 1}
          </span>
          <P n={params.perLayer} />
        </div>
        <p className="text-[10px] text-amber-700/40 mt-0.5">
          pre-norm · MHSA + FFN + 2× residual
        </p>
      </button>
      {open && (
        <div className="mt-1.5 mx-1 rounded-lg border border-orange-900/20 bg-orange-950/8 overflow-hidden divide-y divide-amber-900/10">
          {/* LayerNorm 1 */}
          <div className="px-3 py-2 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-200/50">LayerNorm</span>
              <p className="text-[10px] text-amber-700/35 mt-0.5">{D}d → {D}d · scale + bias</p>
            </div>
            <P n={params.ln} />
          </div>

          {/* MHSA */}
          <div>
            <button onClick={() => setInner(v => v === "mhsa" ? null : "mhsa")}
              className={`w-full text-left px-3 py-2 transition-colors ${inner === "mhsa" ? "bg-amber-900/15" : "hover:bg-amber-900/8"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-200/60">
                  Multi-Head Self-Attention
                </span>
                <P n={params.mhsa} />
              </div>
              <p className="text-[10px] text-amber-700/35 mt-0.5">
                {H} heads × {headDim}d/head → {D}d out
              </p>
            </button>
            {inner === "mhsa" && (
              <div className="px-3 pb-2 space-y-0.5">
                <p className="text-[10px] text-amber-700/35 pb-1 leading-relaxed">
                  Each of the {H} heads attends over the full sequence with {headDim}d queries/keys/values. No bias on projections.
                </p>
                <MatrixRow name={`W_q (×${H} heads)`} fromDim={`${D}`} toDim={`${headDim}`}
                  params={H * D * headDim}
                  desc={`One query projection per head, ${H}×${D}×${headDim} cells`} />
                <MatrixRow name={`W_k (×${H} heads)`} fromDim={`${D}`} toDim={`${headDim}`}
                  params={H * D * headDim} desc="Key projections" />
                <MatrixRow name={`W_v (×${H} heads)`} fromDim={`${D}`} toDim={`${headDim}`}
                  params={H * D * headDim} desc="Value projections" />
                <MatrixRow name="W_o (output)" fromDim={`${D}`} toDim={`${D}`}
                  params={D * D} desc="Concatenated heads → output embedding" />
              </div>
            )}
          </div>

          {/* Residual */}
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] text-amber-700/30 italic">+ residual · x = x + attn_out</span>
            <span className="text-[10px] text-amber-800/25">0p</span>
          </div>

          {/* LayerNorm 2 */}
          <div className="px-3 py-2 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-200/50">LayerNorm</span>
              <p className="text-[10px] text-amber-700/35 mt-0.5">{D}d → {D}d · scale + bias</p>
            </div>
            <P n={params.ln} />
          </div>

          {/* FFN */}
          <div>
            <button onClick={() => setInner(v => v === "ffn" ? null : "ffn")}
              className={`w-full text-left px-3 py-2 transition-colors ${inner === "ffn" ? "bg-amber-900/15" : "hover:bg-amber-900/8"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-200/60">FFN</span>
                <P n={params.ffn} />
              </div>
              <p className="text-[10px] text-amber-700/35 mt-0.5">
                {D} → {F} → {D} · ReLU
              </p>
            </button>
            {inner === "ffn" && (
              <div className="px-3 pb-2 space-y-0.5">
                <MatrixRow name="fc1 + bias" fromDim={`${D}`} toDim={`${F}`}
                  params={D * F + F} desc="Expand to FFN hidden dim" />
                <MatrixRow name="ReLU" fromDim={`${F}`} toDim={`${F}`}
                  params={0} desc="No parameters — elementwise nonlinearity" />
                <MatrixRow name="fc2 + bias" fromDim={`${F}`} toDim={`${D}`}
                  params={F * D + D} desc="Project back to embedding dim" />
              </div>
            )}
          </div>

          {/* Residual */}
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] text-amber-700/30 italic">+ residual · x = x + ffn_out</span>
            <span className="text-[10px] text-amber-800/25">0p</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TransformerDiagram({ configJson }: { configJson: string | null }) {
  const cfg: TransformerConfig = (() => {
    try { return { ...defaultCfg(), ...(JSON.parse(configJson ?? "{}") as Partial<TransformerConfig>) }; }
    catch { return defaultCfg(); }
  })();

  const params = computeParams(cfg);

  return (
    <div className="space-y-3">
      <ParamExplainer total={params.total} bytes={params.total * 4} />

      <div className="space-y-1">
        <InputBlock cfg={cfg} />
        <Arrow />

        {Array.from({ length: cfg.n_layers }, (_, i) => (
          <div key={i}>
            <TransformerLayerBlock layerIdx={i} cfg={cfg} params={params} />
            {i < cfg.n_layers - 1 && <Arrow />}
          </div>
        ))}

        <Arrow />
        <div
          className="w-full text-left px-3 py-2.5 rounded-lg border border-amber-900/20 bg-amber-900/5 flex items-center justify-between"
        >
          <div>
            <span className="text-xs font-semibold text-amber-200/60">LayerNorm (final)</span>
            <p className="text-[10px] text-amber-700/40 mt-0.5">{cfg.embed_dim}d → {cfg.embed_dim}d</p>
          </div>
          <P n={params.lnFinal} />
        </div>
        <Arrow />
        <div className="w-full text-left px-3 py-2.5 rounded-lg border border-amber-900/20 bg-amber-900/5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-amber-200/60">Mean Pool</span>
            <p className="text-[10px] text-amber-700/40 mt-0.5">average over sequence dimension</p>
          </div>
          <span className="text-[10px] text-amber-800/25">0p</span>
        </div>
        <Arrow />
        <div className="w-full text-left px-3 py-2.5 rounded-lg border border-orange-500/30 bg-orange-500/8 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-amber-200/70">Linear Output</span>
            <p className="text-[10px] text-amber-700/40 mt-0.5">{cfg.embed_dim}d → {cfg.n_classes} logits + bias</p>
          </div>
          <P n={params.outProj} />
        </div>
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
