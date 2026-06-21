"""
Baseline Transformer — classes/{id}/model.py

2-layer pre-norm transformer for apples-to-apples comparison with CTM.

Architecture per layer:
    x' = x + MultiHeadSelfAttention(LayerNorm(x))   [pre-norm]
    x'' = x' + FFN(LayerNorm(x'))

Output:
    logits = W_out · mean_pool(LayerNorm(final_hidden)) + b_out

No positional encoding — inputs are bags of embeddings (same as CTM).

Extends PiroModel (from the piro package mounted into Modal containers).
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn

from piro import PiroModel
from piro.schema import ArchitectureGraph, GraphEdge, GraphNode, ModelManifest


# ── Config ────────────────────────────────────────────────────────────────────

@dataclass
class TransformerConfig:
    embed_dim: int = 8
    n_heads: int = 2
    ffn_dim: int = 6       # tuned so total params ≈ CTM within 10%
    n_layers: int = 2
    n_classes: int = 5


# ── Internal layer ────────────────────────────────────────────────────────────

class _TransformerLayer(nn.Module):
    def __init__(self, embed_dim: int, n_heads: int, ffn_dim: int) -> None:
        super().__init__()
        self.ln1 = nn.LayerNorm(embed_dim)
        self.attn = nn.MultiheadAttention(embed_dim, n_heads, bias=False, batch_first=False)
        self.ln2 = nn.LayerNorm(embed_dim)
        self.ffn = nn.Sequential(
            nn.Linear(embed_dim, ffn_dim),
            nn.ReLU(),
            nn.Linear(ffn_dim, embed_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        normed = self.ln1(x)
        attn_out, _ = self.attn(normed, normed, normed, need_weights=False)
        x = x + attn_out
        x = x + self.ffn(self.ln2(x))
        return x


# ── Model ─────────────────────────────────────────────────────────────────────

class BaselineTransformer(PiroModel):
    """Minimal 2-layer transformer baseline.

    2-layer pre-norm transformer with multi-head self-attention.
    Mean-pools the final layer to produce a single classification output.
    Standard baseline for sequence tasks.
    """

    def __init__(self, config: TransformerConfig) -> None:
        super().__init__()
        if config.embed_dim % config.n_heads != 0:
            raise ValueError(
                f"embed_dim ({config.embed_dim}) must be divisible by "
                f"n_heads ({config.n_heads})"
            )
        self.config = config
        cfg = config

        self.layers = nn.ModuleList([
            _TransformerLayer(cfg.embed_dim, cfg.n_heads, cfg.ffn_dim)
            for _ in range(cfg.n_layers)
        ])
        self.ln_final = nn.LayerNorm(cfg.embed_dim)
        self.out_proj = nn.Linear(cfg.embed_dim, cfg.n_classes)

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Parameters
        ----------
        embeddings : torch.Tensor
            Shape (seq_len, embed_dim) or (embed_dim,).

        Returns
        -------
        torch.Tensor
            Shape (n_classes,) — raw logits (pre-softmax).
        """
        x = embeddings if embeddings.ndim == 2 else embeddings.unsqueeze(0)
        for layer in self.layers:
            x = layer(x)
        x = self.ln_final(x)
        pooled = x.mean(dim=0)
        return self.out_proj(pooled)

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    @classmethod
    def serialize(cls) -> ModelManifest:
        cfg = TransformerConfig()

        # Build graph nodes dynamically from config — n_layers drives the loop
        nodes: list[GraphNode] = [
            GraphNode(id="input", type="io", label="Input", detail=f"seq × {cfg.embed_dim}"),
        ]
        edges: list[GraphEdge] = []
        prev = "input"

        for i in range(cfg.n_layers):
            group = f"Layer {i + 1}"
            layer_nodes = [
                GraphNode(id=f"l{i}_ln1",  type="norm",      label="Layer Norm",           group=group),
                GraphNode(id=f"l{i}_attn", type="attention", label="Multi-Head Attention",  detail=f"{cfg.n_heads} heads · dim {cfg.embed_dim}", group=group),
                GraphNode(id=f"l{i}_res1", type="residual",  label="Residual Add",          group=group),
                GraphNode(id=f"l{i}_ln2",  type="norm",      label="Layer Norm",            group=group),
                GraphNode(id=f"l{i}_ffn",  type="ffn",       label="Feed-Forward",          detail=f"{cfg.embed_dim} → {cfg.ffn_dim} → {cfg.embed_dim} · ReLU", group=group),
                GraphNode(id=f"l{i}_res2", type="residual",  label="Residual Add",          group=group),
            ]
            nodes.extend(layer_nodes)
            for node in layer_nodes:
                edges.append(GraphEdge(**{"from": prev, "to": node.id}))
                prev = node.id

        for node in [
            GraphNode(id="ln_final", type="norm",   label="Layer Norm"),
            GraphNode(id="pool",     type="pool",   label="Mean Pool",  detail="seq_len → 1"),
            GraphNode(id="out_proj", type="linear", label="Linear",     detail=f"{cfg.embed_dim} → {cfg.n_classes}"),
            GraphNode(id="output",   type="io",     label="Output",     detail=f"{cfg.n_classes} logits"),
        ]:
            nodes.append(node)
            edges.append(GraphEdge(**{"from": prev, "to": node.id}))
            prev = node.id

        return ModelManifest(
            name="Baseline Transformer",
            slug="baseline-transformer",
            description=(
                "2-layer pre-norm transformer with multi-head self-attention. "
                "Mean-pools the final layer to produce a single classification output. "
                "Standard baseline for sequence tasks."
            ),
            hyperparams={
                "embed_dim": cfg.embed_dim,
                "n_heads": cfg.n_heads,
                "ffn_dim": cfg.ffn_dim,
                "n_layers": cfg.n_layers,
                "n_classes": cfg.n_classes,
            },
            parameterCount=cls(cfg).count_parameters(),
            module="baseline_transformer",
            modelClass="BaselineTransformer",
            configClass="TransformerConfig",
            graph=ArchitectureGraph(nodes=nodes, edges=edges),
        )
