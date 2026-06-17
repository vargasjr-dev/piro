"use client";

import { useState } from "react";

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
  const { embed_dim, n_heads, ffn_dim, n_layers, n_classes } = cfg;
  // Each transformer layer: MHSA (Q, K, V, O projections) + FFN (2 linear) + 2 LayerNorm
  const head_dim = embed_dim / n_heads;
  const mhsa = n_heads * (embed_dim * head_dim) * 3 + embed_dim * embed_dim; // Q, K, V projections + O
  const ffn = embed_dim * ffn_dim + ffn_dim + ffn_dim * embed_dim + embed_dim;
  const ln = embed_dim * 2; // scale + bias per LN
  const perLayer = mhsa + ffn + ln * 2;
  const totalLayers = perLayer * n_layers;
  const lnFinal = embed_dim * 2;
  const outProj = embed_dim * n_classes + n_classes;
  return { perLayer, totalLayers, lnFinal, outProj, total: totalLayers + lnFinal + outProj };
}

interface BlockProps {
  label: string;
  sub?: string;
  params?: number;
  accent?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}

function Block({ label, sub, params, accent, expanded, onToggle, children }: BlockProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        disabled={!onToggle}
        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
          accent
            ? "border-orange-500/30 bg-orange-500/8"
            : expanded
            ? "border-amber-700/40 bg-amber-900/10"
            : "border-amber-900/20 bg-amber-900/5 hover:bg-amber-900/10"
        } ${onToggle ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold ${accent ? "text-amber-200/80" : "text-amber-300/60"}`}>
            {label}
          </span>
          {params !== undefined && (
            <span className="text-[10px] font-mono text-amber-500/40">{params.toLocaleString()} p</span>
          )}
        </div>
        {sub && <p className="text-[10px] text-amber-700/40 mt-0.5">{sub}</p>}
      </button>
      {expanded && children && (
        <div className="ml-3 mt-1 pl-3 border-l border-amber-900/20 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

// Connector arrow between blocks
function Arrow() {
  return (
    <div className="flex justify-center py-0.5">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v8M3 7l3 3 3-3" stroke="rgba(146,64,14,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function TransformerDiagram({ configJson }: { configJson: string | null }) {
  const cfg: TransformerConfig = (() => {
    try { return { ...defaultCfg(), ...(JSON.parse(configJson ?? "{}") as Partial<TransformerConfig>) }; }
    catch { return defaultCfg(); }
  })();

  const params = computeParams(cfg);
  const [expandedLayer, setExpandedLayer] = useState<number | null>(null);

  const headDim = cfg.embed_dim / cfg.n_heads;

  return (
    <div className="space-y-6">
      {/* Attention head visualizer */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-[10px] text-amber-600/40 uppercase tracking-widest">Attention heads</p>
        <div className="flex gap-3 items-end">
          {Array.from({ length: cfg.n_heads }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="rounded border border-orange-500/30 bg-orange-500/8 flex items-center justify-center"
                style={{ width: 40 + headDim * 4, height: 40 + headDim * 4 }}
              >
                <span className="text-[9px] text-amber-400/60 font-mono">d={headDim}</span>
              </div>
              <span className="text-[9px] text-amber-700/40">H{i}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-amber-700/30">
          {cfg.n_heads} heads × {headDim}d = {cfg.embed_dim}d total · no positional encoding
        </p>
      </div>

      {/* Sequential flow */}
      <div className="space-y-1">
        <p className="text-[10px] text-amber-600/40 uppercase tracking-widest">Forward pass</p>

        <Block label={`Input (${cfg.embed_dim}d embeddings)`} sub="bag of embeddings, no positional encoding" />
        <Arrow />

        {Array.from({ length: cfg.n_layers }, (_, li) => (
          <div key={li}>
            <Block
              label={`Transformer Layer ${li + 1}`}
              params={params.perLayer}
              expanded={expandedLayer === li}
              onToggle={() => setExpandedLayer(expandedLayer === li ? null : li)}
            >
              <Block label="LayerNorm" sub={`${cfg.embed_dim}d → ${cfg.embed_dim}d`} params={cfg.embed_dim * 2} />
              <Block
                label={`Multi-Head Self-Attention`}
                sub={`${cfg.n_heads} heads × ${headDim}d → ${cfg.embed_dim}d out`}
                params={params.perLayer - cfg.embed_dim * cfg.ffn_dim - cfg.ffn_dim - cfg.ffn_dim * cfg.embed_dim - cfg.embed_dim - cfg.embed_dim * 4}
              />
              <Block label="Residual add" sub="x = x + attn_out" />
              <Block label="LayerNorm" sub={`${cfg.embed_dim}d → ${cfg.embed_dim}d`} params={cfg.embed_dim * 2} />
              <Block
                label="FFN"
                sub={`${cfg.embed_dim} → ${cfg.ffn_dim} → ${cfg.embed_dim} · ReLU`}
                params={cfg.embed_dim * cfg.ffn_dim + cfg.ffn_dim + cfg.ffn_dim * cfg.embed_dim + cfg.embed_dim}
              />
              <Block label="Residual add" sub="x = x + ffn_out" />
            </Block>
            {li < cfg.n_layers - 1 && <Arrow />}
          </div>
        ))}

        <Arrow />
        <Block label="LayerNorm (final)" params={params.lnFinal} sub={`${cfg.embed_dim}d → ${cfg.embed_dim}d`} />
        <Arrow />
        <Block label="Mean pool" sub="average over sequence dimension" />
        <Arrow />
        <Block
          label={`Linear output`}
          params={params.outProj}
          sub={`${cfg.embed_dim}d → ${cfg.n_classes} logits`}
          accent
        />
      </div>
    </div>
  );
}
