"""
model/ctm.py

ContinuousThoughtModel — wires SyncAttention, TickLoop, ConfidenceHead, OutputHead.

The CTM runs an iterative tick loop over a set of neuron embeddings. Each tick:
  1. Attends over embeddings using the current sync matrix as a query source.
  2. Updates neurons with the attended context.
  3. Recomputes the pairwise sync matrix via Pearson correlation.
  4. Checks confidence — terminates early if confidence ≥ threshold.

After the loop, the OutputHead produces a class probability distribution from
the final sync matrix.

Usage
-----
    from model.ctm import ContinuousThoughtModel, CTMConfig

    cfg = CTMConfig(n_neurons=4, embed_dim=8, query_dim=8,
                    value_dim=4, hidden_dim=16, n_classes=5)
    model = ContinuousThoughtModel(cfg)
    output = model(embeddings)   # embeddings: (N, embed_dim)
    print(output.logits)         # (n_classes,) logits
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn

from .layers import ConfidenceHead, OutputHead, SyncAttention, TickLoop, TickLoopLog
from .layers.tick_loop import DEFAULT_CONFIDENCE_THRESHOLD, MAX_TICKS


@dataclass
class CTMConfig:
    n_neurons: int = 4
    embed_dim: int = 8
    query_dim: int = 8
    value_dim: int = 4
    hidden_dim: int = 16
    n_classes: int = 5
    max_ticks: int = MAX_TICKS
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD


@dataclass
class CTMOutput:
    logits: torch.Tensor        # (n_classes,) — raw pre-softmax logits
    probs: torch.Tensor         # (n_classes,) — softmax probabilities
    confidence: float           # final confidence scalar
    tick_count: int             # ticks run
    log: TickLoopLog


class ContinuousThoughtModel(nn.Module):
    """Continuous Thought Model.

    Parameters
    ----------
    config : CTMConfig
    """

    def __init__(self, config: CTMConfig) -> None:
        super().__init__()
        self.config = config
        cfg = config

        self.attention = SyncAttention(
            n_neurons=cfg.n_neurons,
            embed_dim=cfg.embed_dim,
            query_dim=cfg.query_dim,
            value_dim=cfg.value_dim,
        )
        self.confidence_head = ConfidenceHead(
            n_neurons=cfg.n_neurons,
            hidden_dim=cfg.hidden_dim,
        )
        self.tick_loop = TickLoop(
            attention=self.attention,
            confidence_head=self.confidence_head,
            max_ticks=cfg.max_ticks,
            confidence_threshold=cfg.confidence_threshold,
        )
        self.output_head = OutputHead(
            n_neurons=cfg.n_neurons,
            hidden_dim=cfg.hidden_dim,
            n_classes=cfg.n_classes,
        )

    def forward(self, embeddings: torch.Tensor) -> CTMOutput:
        """Run the full CTM forward pass.

        Parameters
        ----------
        embeddings : torch.Tensor
            Shape (N, embed_dim) or (embed_dim,) for a single embedding.

        Returns
        -------
        CTMOutput
        """
        if embeddings.ndim == 1:
            embeddings = embeddings.unsqueeze(0)  # (1, embed_dim)

        _context, sync, log = self.tick_loop(embeddings)
        logits = self.output_head.logits(sync)
        probs = self.output_head(sync)

        return CTMOutput(
            logits=logits,
            probs=probs,
            confidence=log.confidence,
            tick_count=log.ticks_run,
            log=log,
        )

    def count_parameters(self) -> int:
        """Count all trainable scalar parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
