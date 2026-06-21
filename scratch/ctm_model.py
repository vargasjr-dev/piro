"""
Continuous Thought Model — classes/{id}/model.py

Iterative tick-loop architecture with sync-driven attention. Neuron state
accumulates across ticks before committing to an output — trades parameter
efficiency for internal reasoning depth.

Self-contained: all layer classes inlined so this file can be exec'd standalone
by the Piro serialize endpoint without any external model/ imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn as nn

from piro import PiroModel
from piro.schema import ArchitectureGraph, GraphEdge, GraphNode


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pearson_correlation(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    a = a - a.mean()
    b = b - b.mean()
    denom = (a.norm() * b.norm()).clamp(min=1e-8)
    return (a @ b) / denom


def _compute_sync(context: torch.Tensor) -> torch.Tensor:
    n = context.shape[0]
    sync = torch.zeros(n, n, dtype=context.dtype, device=context.device)
    for i in range(n):
        for j in range(n):
            sync[i, j] = _pearson_correlation(context[i], context[j])
    return sync


# ── Layers ────────────────────────────────────────────────────────────────────

class _SyncAttention(nn.Module):
    def __init__(self, n_neurons: int, embed_dim: int, query_dim: int, value_dim: int) -> None:
        super().__init__()
        self.W_q = nn.Linear(n_neurons, query_dim, bias=False)
        self.W_k = nn.Linear(embed_dim, query_dim, bias=False)
        self.W_v = nn.Linear(embed_dim, value_dim, bias=False)
        self.scale = query_dim ** -0.5

    def forward(self, sync: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        Q = self.W_q(sync)
        K = self.W_k(context)
        V = self.W_v(context)
        return torch.softmax((Q @ K.T) * self.scale, dim=-1) @ V


class _ConfidenceHead(nn.Module):
    def __init__(self, n_neurons: int, hidden_dim: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_neurons * n_neurons, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
            nn.Sigmoid(),
        )

    def forward(self, sync: torch.Tensor) -> torch.Tensor:
        return self.net(sync.flatten()).squeeze()


class _OutputHead(nn.Module):
    def __init__(self, n_neurons: int, hidden_dim: int, n_classes: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_neurons * n_neurons, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, n_classes),
        )

    def logits(self, sync: torch.Tensor) -> torch.Tensor:
        return self.net(sync.flatten())

    def forward(self, sync: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.logits(sync), dim=-1)


@dataclass
class _TickLoopLog:
    ticks_run: int
    max_ticks: int
    converged: bool
    confidence: float
    confidence_threshold: float


@dataclass
class CTMOutput:
    logits: torch.Tensor
    probs: torch.Tensor
    confidence: float
    tick_count: int
    log: _TickLoopLog


# ── Model ─────────────────────────────────────────────────────────────────────

class ContinuousThoughtModel(PiroModel):
    """Continuous Thought Model — typed HyperParameters style."""

    # ── Manifest fields ────────────────────────────────────────────────────
    name        = "Continuous Thought Model"
    slug        = "ctm"
    description = (
        "Iterative tick-loop architecture with sync-driven attention. "
        "Neuron state accumulates across ticks before committing to an output — "
        "trades parameter efficiency for internal reasoning depth."
    )
    module = "ctm"

    # Nested class → auto-converted to @dataclass by PiroModel.__init_subclass__.
    # hyper_parameters dict is derived automatically — do not define manually.
    class HyperParameters:
        n_neurons:            int   = 4
        embed_dim:            int   = 8
        query_dim:            int   = 8
        value_dim:            int   = 8    # must equal embed_dim
        hidden_dim:           int   = 16
        n_classes:            int   = 5
        max_ticks:            int   = 32
        confidence_threshold: float = 0.9

    # ── PiroModel interface ────────────────────────────────────────────────
    @classmethod
    def build_default(cls) -> "ContinuousThoughtModel":
        return cls(cls.HyperParameters())

    @classmethod
    def serialize_graph(cls) -> Optional[ArchitectureGraph]:
        hp = cls.hyper_parameters      # always a plain dict — safe to read here
        n       = hp["n_neurons"]
        q_dim   = hp["query_dim"]
        hidden  = hp["hidden_dim"]
        n_cls   = hp["n_classes"]
        ticks   = hp["max_ticks"]
        thresh  = hp["confidence_threshold"]
        embed   = hp["embed_dim"]

        return ArchitectureGraph(
            nodes=[
                GraphNode(id="input",     type="io",   label="Input",       detail=f"{n} × {embed}"),
                GraphNode(id="sync_init", type="sync", label="Sync Matrix", detail=f"Pearson correlation · {n}×{n}"),
                GraphNode(
                    id="tick_loop", type="loop",
                    label="Tick Loop",
                    detail=f"max {ticks} ticks · exits when confidence ≥ {thresh}",
                    nodes=[
                        GraphNode(id="tl_attn", type="attention",  label="Sync Attention",  detail=f"query from sync · K/V from context · dim {q_dim}"),
                        GraphNode(id="tl_sync", type="sync",       label="Recompute Sync",  detail=f"Pearson correlation · {n}×{n}"),
                        GraphNode(id="tl_conf", type="confidence", label="Confidence Gate", detail=f"hidden {hidden} · threshold {thresh}"),
                    ],
                ),
                GraphNode(id="out_head", type="linear", label="Output Head", detail=f"{n}×{n} sync → hidden {hidden} → {n_cls}"),
                GraphNode(id="output",   type="io",     label="Output",      detail=f"{n_cls} logits"),
            ],
            edges=[
                GraphEdge(**{"from": "input",     "to": "sync_init"}),
                GraphEdge(**{"from": "sync_init", "to": "tick_loop"}),
                GraphEdge(**{"from": "tick_loop", "to": "out_head"}),
                GraphEdge(**{"from": "out_head",  "to": "output"}),
            ],
        )

    # ── nn.Module ──────────────────────────────────────────────────────────
    def __init__(self, hp: "ContinuousThoughtModel.HyperParameters | None" = None) -> None:
        super().__init__()
        hp = hp or type(self).HyperParameters()
        if hp.value_dim != hp.embed_dim:
            raise ValueError(
                f"value_dim ({hp.value_dim}) must equal embed_dim ({hp.embed_dim})"
            )
        self.hp = hp
        self.attention = _SyncAttention(
            n_neurons=hp.n_neurons,
            embed_dim=hp.embed_dim,
            query_dim=hp.query_dim,
            value_dim=hp.value_dim,
        )
        self.confidence_head = _ConfidenceHead(hp.n_neurons, hp.hidden_dim)
        self.output_head = _OutputHead(hp.n_neurons, hp.hidden_dim, hp.n_classes)

    def forward(self, embeddings: torch.Tensor) -> CTMOutput:
        if embeddings.ndim == 1:
            embeddings = embeddings.unsqueeze(0)

        context = embeddings
        sync = _compute_sync(context)
        confidence = torch.tensor(0.0)
        ticks_run, converged = 0, False

        for tick in range(self.hp.max_ticks):
            ticks_run = tick + 1
            context = self.attention(sync, context)
            sync = _compute_sync(context)
            confidence = self.confidence_head(sync)
            if confidence.item() >= self.hp.confidence_threshold:
                converged = True
                break

        log = _TickLoopLog(
            ticks_run=ticks_run,
            max_ticks=self.hp.max_ticks,
            converged=converged,
            confidence=float(confidence.item()),
            confidence_threshold=self.hp.confidence_threshold,
        )
        return CTMOutput(
            logits=self.output_head.logits(sync),
            probs=self.output_head(sync),
            confidence=log.confidence,
            tick_count=log.ticks_run,
            log=log,
        )
