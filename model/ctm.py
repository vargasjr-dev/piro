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
    value_dim: int = 8  # must equal embed_dim — tick loop reuses output as next context
    hidden_dim: int = 16
    n_classes: int = 5
    max_ticks: int = MAX_TICKS
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD

    def __post_init__(self) -> None:
        if self.value_dim != self.embed_dim:
            raise ValueError(
                f"CTMConfig: value_dim ({self.value_dim}) must equal embed_dim "
                f"({self.embed_dim}) — the tick loop feeds attention output back "
                "as the next context, so their shapes must match."
            )


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


def _build_graph(cfg: CTMConfig) -> dict:
    """Build a JSON-serialisable architecture graph for the CTM.

    The tick loop is represented as a single node of ``type="loop"`` containing
    its interior steps.  The UI renders it as a dashed-border section with a
    back-arrow indicating iteration.
    """
    nodes: list[dict] = [
        {
            "id": "input",
            "type": "io",
            "label": "Input",
            "detail": f"{cfg.n_neurons} × {cfg.embed_dim}",
        },
        {
            "id": "sync_init",
            "type": "sync",
            "label": "Sync Matrix",
            "detail": f"Pearson correlation · {cfg.n_neurons}×{cfg.n_neurons}",
        },
        {
            "id": "tick_loop",
            "type": "loop",
            "label": "Tick Loop",
            "detail": f"max {cfg.max_ticks} ticks · exits when confidence ≥ {cfg.confidence_threshold}",
            "nodes": [
                {
                    "id": "tl_attn",
                    "type": "attention",
                    "label": "Sync Attention",
                    "detail": f"query from sync · K/V from context · dim {cfg.query_dim}",
                },
                {
                    "id": "tl_sync",
                    "type": "sync",
                    "label": "Recompute Sync",
                    "detail": f"Pearson correlation · {cfg.n_neurons}×{cfg.n_neurons}",
                },
                {
                    "id": "tl_conf",
                    "type": "confidence",
                    "label": "Confidence Gate",
                    "detail": f"hidden {cfg.hidden_dim} · threshold {cfg.confidence_threshold}",
                },
            ],
        },
        {
            "id": "out_head",
            "type": "linear",
            "label": "Output Head",
            "detail": f"{cfg.n_neurons}×{cfg.n_neurons} sync → hidden {cfg.hidden_dim} → {cfg.n_classes}",
        },
        {
            "id": "output",
            "type": "io",
            "label": "Output",
            "detail": f"{cfg.n_classes} logits",
        },
    ]
    edges: list[dict] = [
        {"from": "input",     "to": "sync_init"},
        {"from": "sync_init", "to": "tick_loop"},
        {"from": "tick_loop", "to": "out_head"},
        {"from": "out_head",  "to": "output"},
    ]
    return {"nodes": nodes, "edges": edges}


def serialize() -> dict:
    """Return a JSON-serialisable manifest describing this model class.

    Called by tooling to populate the editor manifest (classes/{id}/manifest.json).
    Fields here are the source of truth for display in the Piro UI.
    """
    cfg = CTMConfig()
    return {
        "name": "Continuous Thought Model",
        "slug": "ctm",
        "description": (
            "Iterative tick-loop architecture with sync-driven attention. "
            "Neuron state accumulates across ticks before committing to an output — "
            "trades parameter efficiency for internal reasoning depth."
        ),
        "hyperparams": {
            "n_neurons": cfg.n_neurons,
            "embed_dim": cfg.embed_dim,
            "query_dim": cfg.query_dim,
            "value_dim": cfg.value_dim,
            "hidden_dim": cfg.hidden_dim,
            "n_classes": cfg.n_classes,
            "max_ticks": cfg.max_ticks,
            "confidence_threshold": cfg.confidence_threshold,
        },
        "parameterCount": ContinuousThoughtModel(cfg).count_parameters(),
        "module": "model.ctm",
        "modelClass": "ContinuousThoughtModel",
        "configClass": "CTMConfig",
        "graph": _build_graph(cfg),
    }
