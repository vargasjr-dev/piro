"""
model/baseline_transformer.py

BaselineTransformer — 2-layer transformer for apples-to-apples comparison with CTM.

Architecture per layer:
    x' = x + MultiHeadSelfAttention(LayerNorm(x))   [pre-norm]
    x'' = x' + FFN(LayerNorm(x'))

Output:
    logits = W_out · mean_pool(LayerNorm(final_hidden)) + b_out

No positional encoding — inputs are bags of embeddings (same as CTM).

Default config (embedDim=8, nHeads=2, ffnDim=6, nLayers=2, nClasses=5):
    857 parameters — within 1.5% of CTM's 870.

Usage
-----
    from model.baseline_transformer import BaselineTransformer, TransformerConfig

    cfg = TransformerConfig(embed_dim=8, n_heads=2, ffn_dim=6, n_layers=2, n_classes=5)
    model = BaselineTransformer(cfg)
    logits = model(embeddings)   # embeddings: (seq_len, embed_dim) or (embed_dim,)
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class TransformerConfig:
    embed_dim: int = 8
    n_heads: int = 2
    ffn_dim: int = 6       # tuned so total params ≈ CTM within 10%
    n_layers: int = 2
    n_classes: int = 5


class BaselineTransformer(nn.Module):
    """Minimal 2-layer transformer baseline.

    Parameters
    ----------
    config : TransformerConfig
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
        pooled = x.mean(dim=0)          # mean pool over sequence
        return self.out_proj(pooled)    # (n_classes,) logits

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


def serialize() -> dict:
    """Return a JSON-serialisable manifest describing this model class.

    Called by tooling to populate the editor manifest (classes/{id}/manifest.json).
    Fields here are the source of truth for display in the Piro UI.
    """
    cfg = TransformerConfig()
    return {
        "name": "Baseline Transformer",
        "slug": "baseline-transformer",
        "description": (
            "2-layer pre-norm transformer with multi-head self-attention. "
            "Mean-pools the final layer to produce a single classification output. "
            "Standard baseline for sequence tasks."
        ),
        "hyperparams": {
            "embed_dim": cfg.embed_dim,
            "n_heads": cfg.n_heads,
            "ffn_dim": cfg.ffn_dim,
            "n_layers": cfg.n_layers,
            "n_classes": cfg.n_classes,
        },
        "parameterCount": BaselineTransformer(cfg).count_parameters(),
        "module": "model.baseline_transformer",
        "modelClass": "BaselineTransformer",
        "configClass": "TransformerConfig",
    }


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
        # Pre-norm self-attention with residual
        normed = self.ln1(x)
        attn_out, _ = self.attn(normed, normed, normed, need_weights=False)
        x = x + attn_out
        # Pre-norm FFN with residual
        x = x + self.ffn(self.ln2(x))
        return x
