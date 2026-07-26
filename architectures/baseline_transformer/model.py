"""Small matched transformer baseline for CTM research experiments."""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn

from architectures._common import ArchitectureModel
from architectures._common.schema import ArchitectureGraph, GraphEdge, GraphNode


class _TransformerLayer(nn.Module):
    def __init__(self, embed_dim: int, n_heads: int, ffn_dim: int) -> None:
        super().__init__()
        self.ln1 = nn.LayerNorm(embed_dim)
        self.attn = nn.MultiheadAttention(embed_dim, n_heads, bias=False, batch_first=False)
        self.ln2 = nn.LayerNorm(embed_dim)
        self.ffn = nn.Sequential(
            nn.Linear(embed_dim, ffn_dim), nn.ReLU(), nn.Linear(ffn_dim, embed_dim)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        normed = self.ln1(x)
        attn_out, _ = self.attn(normed, normed, normed, need_weights=False)
        x = x + attn_out
        return x + self.ffn(self.ln2(x))


@dataclass
class TransformerConfig:
    embed_dim: int = 8
    n_heads: int = 2
    ffn_dim: int = 6
    n_layers: int = 2
    n_classes: int = 5


class BaselineTransformer(ArchitectureModel):
    name = "Baseline Transformer"
    slug = "baseline-transformer"
    description = "Matched pre-norm transformer baseline for stateful-model experiments."
    module = "baseline_transformer"
    hyper_parameters = {**TransformerConfig().__dict__}

    @classmethod
    def serialize_graph(cls) -> ArchitectureGraph | None:
        hp = cls.hyper_parameters
        return ArchitectureGraph(
            nodes=[
                GraphNode(id="input", type="io", label="Input"),
                GraphNode(
                    id="layers",
                    type="attention",
                    label="Transformer Layers",
                    detail=f"{hp['n_layers']} × pre-norm attention",
                ),
                GraphNode(id="pool", type="pool", label="Mean Pool"),
                GraphNode(
                    id="output", type="io", label="Output", detail=f"{hp['n_classes']} logits"
                ),
            ],
            edges=[
                GraphEdge(**{"from": "input", "to": "layers"}),
                GraphEdge(**{"from": "layers", "to": "pool"}),
                GraphEdge(**{"from": "pool", "to": "output"}),
            ],
        )

    def __init__(self, config: TransformerConfig | None = None, **kwargs: int) -> None:
        super().__init__()
        cfg = config or TransformerConfig(**kwargs)
        if cfg.embed_dim % cfg.n_heads:
            raise ValueError("embed_dim must be divisible by n_heads")
        self.config = cfg
        self.layers = nn.ModuleList(
            [
                _TransformerLayer(cfg.embed_dim, cfg.n_heads, cfg.ffn_dim)
                for _ in range(cfg.n_layers)
            ]
        )
        self.ln_final = nn.LayerNorm(cfg.embed_dim)
        self.out_proj = nn.Linear(cfg.embed_dim, cfg.n_classes)

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        if embeddings.ndim == 1:
            embeddings = embeddings.unsqueeze(0)
        if embeddings.ndim != 2:
            raise ValueError("expected embeddings with shape [sequence, embed_dim]")
        x = embeddings
        for layer in self.layers:
            x = layer(x)
        return self.out_proj(self.ln_final(x).mean(dim=0))
