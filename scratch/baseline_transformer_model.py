"""
Baseline Transformer — classes/{id}/model.py

2-layer pre-norm transformer for apples-to-apples comparison with CTM.

Architecture per layer:
    x' = x + MultiHeadSelfAttention(LayerNorm(x))   [pre-norm]
    x'' = x' + FFN(LayerNorm(x'))

Output:
    logits = W_out · mean_pool(LayerNorm(final_hidden)) + b_out

No positional encoding — inputs are bags of embeddings (same as CTM).
"""

from __future__ import annotations

from typing import Optional

import torch
import torch.nn as nn

from piro import PiroModel
from piro.schema import ArchitectureGraph, GraphEdge, GraphNode


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
    """Minimal 2-layer transformer baseline — plain dict style."""

    # ── Manifest fields ────────────────────────────────────────────────────
    name        = "Baseline Transformer"
    slug        = "baseline-transformer"
    description = (
        "2-layer pre-norm transformer with multi-head self-attention. "
        "Mean-pools the final layer to produce a single classification output. "
        "Standard baseline for sequence tasks."
    )
    module = "baseline_transformer"

    hyper_parameters = {
        "embed_dim": 8,
        "n_heads":   2,
        "ffn_dim":   6,
        "n_layers":  2,
        "n_classes": 5,
    }

    # ── PiroModel interface ────────────────────────────────────────────────
    @classmethod
    def build_default(cls) -> "BaselineTransformer":
        return cls(**cls.hyper_parameters)

    @classmethod
    def serialize_graph(cls) -> Optional[ArchitectureGraph]:
        hp = cls.hyper_parameters
        embed_dim = hp["embed_dim"]
        n_heads   = hp["n_heads"]
        ffn_dim   = hp["ffn_dim"]
        n_layers  = hp["n_layers"]
        n_classes = hp["n_classes"]

        nodes: list[GraphNode] = [
            GraphNode(id="input", type="io", label="Input", detail=f"seq × {embed_dim}"),
        ]
        edges: list[GraphEdge] = []
        prev = "input"

        for i in range(n_layers):
            group = f"Layer {i + 1}"
            layer_nodes = [
                GraphNode(id=f"l{i}_ln1",  type="norm",      label="Layer Norm",          group=group),
                GraphNode(id=f"l{i}_attn", type="attention", label="Multi-Head Attention", detail=f"{n_heads} heads · dim {embed_dim}", group=group),
                GraphNode(id=f"l{i}_res1", type="residual",  label="Residual Add",         group=group),
                GraphNode(id=f"l{i}_ln2",  type="norm",      label="Layer Norm",           group=group),
                GraphNode(id=f"l{i}_ffn",  type="ffn",       label="Feed-Forward",         detail=f"{embed_dim} → {ffn_dim} → {embed_dim} · ReLU", group=group),
                GraphNode(id=f"l{i}_res2", type="residual",  label="Residual Add",         group=group),
            ]
            nodes.extend(layer_nodes)
            for node in layer_nodes:
                edges.append(GraphEdge(**{"from": prev, "to": node.id}))
                prev = node.id

        for node in [
            GraphNode(id="ln_final", type="norm",   label="Layer Norm"),
            GraphNode(id="pool",     type="pool",   label="Mean Pool",  detail="seq_len → 1"),
            GraphNode(id="out_proj", type="linear", label="Linear",     detail=f"{embed_dim} → {n_classes}"),
            GraphNode(id="output",   type="io",     label="Output",     detail=f"{n_classes} logits"),
        ]:
            nodes.append(node)
            edges.append(GraphEdge(**{"from": prev, "to": node.id}))
            prev = node.id

        return ArchitectureGraph(nodes=nodes, edges=edges)

    # ── nn.Module ──────────────────────────────────────────────────────────
    def __init__(
        self,
        embed_dim: int = 8,
        n_heads:   int = 2,
        ffn_dim:   int = 6,
        n_layers:  int = 2,
        n_classes: int = 5,
    ) -> None:
        super().__init__()
        if embed_dim % n_heads != 0:
            raise ValueError(
                f"embed_dim ({embed_dim}) must be divisible by n_heads ({n_heads})"
            )
        self.layers = nn.ModuleList([
            _TransformerLayer(embed_dim, n_heads, ffn_dim)
            for _ in range(n_layers)
        ])
        self.ln_final = nn.LayerNorm(embed_dim)
        self.out_proj = nn.Linear(embed_dim, n_classes)
        self.embed_dim = embed_dim

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        x = embeddings if embeddings.ndim == 2 else embeddings.unsqueeze(0)
        for layer in self.layers:
            x = layer(x)
        x = self.ln_final(x)
        return self.out_proj(x.mean(dim=0))
