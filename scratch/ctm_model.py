"""
Continuous Thought Model — classes/{id}/model.py

Self-contained: all layer classes are inlined so this file can be exec'd
standalone by the Piro serialize endpoint without any external model/ imports.

Extends PiroModel (from the piro package mounted into Modal containers).
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn

from piro import PiroModel
from piro.schema import ArchitectureGraph, GraphEdge, GraphNode, ModelManifest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pearson_correlation(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    """Pearson correlation between two 1-D tensors. Returns a scalar tensor."""
    a = a - a.mean()
    b = b - b.mean()
    denom = (a.norm() * b.norm()).clamp(min=1e-8)
    return (a @ b) / denom


def _compute_sync(context: torch.Tensor) -> torch.Tensor:
    """Build N×N Pearson correlation sync matrix from context vectors."""
    n = context.shape[0]
    sync = torch.zeros(n, n, dtype=context.dtype, device=context.device)
    for i in range(n):
        for j in range(n):
            sync[i, j] = _pearson_correlation(context[i], context[j])
    return sync


# ── Layers ────────────────────────────────────────────────────────────────────

class _SyncAttention(nn.Module):
    """Attention where queries come from the sync matrix rows."""

    def __init__(self, n_neurons: int, embed_dim: int, query_dim: int, value_dim: int) -> None:
        super().__init__()
        self.W_q = nn.Linear(n_neurons, query_dim, bias=False)
        self.W_k = nn.Linear(embed_dim, query_dim, bias=False)
        self.W_v = nn.Linear(embed_dim, value_dim, bias=False)
        self.scale = query_dim ** -0.5

    def forward(self, sync: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        # sync: (N, N), context: (N, embed_dim)
        Q = self.W_q(sync)          # (N, query_dim)
        K = self.W_k(context)       # (N, query_dim)
        V = self.W_v(context)       # (N, value_dim)
        scores = (Q @ K.T) * self.scale
        weights = torch.softmax(scores, dim=-1)
        return weights @ V           # (N, value_dim)


class _ConfidenceHead(nn.Module):
    """Maps the sync matrix to a scalar confidence in [0, 1]."""

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
    """Maps the final sync matrix to class logits."""

    def __init__(self, n_neurons: int, hidden_dim: int, n_classes: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_neurons * n_neurons, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, n_classes),
        )

    def forward(self, sync: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.logits(sync), dim=-1)

    def logits(self, sync: torch.Tensor) -> torch.Tensor:
        return self.net(sync.flatten())


@dataclass
class _TickLoopLog:
    ticks_run: int
    max_ticks: int
    converged: bool
    confidence: float
    confidence_threshold: float


# ── Config ────────────────────────────────────────────────────────────────────

@dataclass
class CTMConfig:
    n_neurons: int = 4
    embed_dim: int = 8
    query_dim: int = 8
    value_dim: int = 8   # must equal embed_dim
    hidden_dim: int = 16
    n_classes: int = 5
    max_ticks: int = 32
    confidence_threshold: float = 0.9

    def __post_init__(self) -> None:
        if self.value_dim != self.embed_dim:
            raise ValueError(
                f"CTMConfig: value_dim ({self.value_dim}) must equal embed_dim "
                f"({self.embed_dim})"
            )


@dataclass
class CTMOutput:
    logits: torch.Tensor
    probs: torch.Tensor
    confidence: float
    tick_count: int
    log: _TickLoopLog


# ── Model ─────────────────────────────────────────────────────────────────────

class ContinuousThoughtModel(PiroModel):
    """Continuous Thought Model.

    Iterative tick-loop architecture with sync-driven attention.
    Neuron state accumulates across ticks before committing to an output —
    trades parameter efficiency for internal reasoning depth.
    """

    def __init__(self, config: CTMConfig) -> None:
        super().__init__()
        self.config = config
        cfg = config

        self.attention = _SyncAttention(
            n_neurons=cfg.n_neurons,
            embed_dim=cfg.embed_dim,
            query_dim=cfg.query_dim,
            value_dim=cfg.value_dim,
        )
        self.confidence_head = _ConfidenceHead(
            n_neurons=cfg.n_neurons,
            hidden_dim=cfg.hidden_dim,
        )
        self.output_head = _OutputHead(
            n_neurons=cfg.n_neurons,
            hidden_dim=cfg.hidden_dim,
            n_classes=cfg.n_classes,
        )

    def forward(self, embeddings: torch.Tensor) -> CTMOutput:
        if embeddings.ndim == 1:
            embeddings = embeddings.unsqueeze(0)

        context = embeddings
        sync = _compute_sync(context)
        confidence = torch.tensor(0.0)
        ticks_run = 0
        converged = False

        for tick in range(self.config.max_ticks):
            ticks_run = tick + 1
            context = self.attention(sync, context)
            sync = _compute_sync(context)
            confidence = self.confidence_head(sync)
            if confidence.item() >= self.config.confidence_threshold:
                converged = True
                break

        log = _TickLoopLog(
            ticks_run=ticks_run,
            max_ticks=self.config.max_ticks,
            converged=converged,
            confidence=float(confidence.item()),
            confidence_threshold=self.config.confidence_threshold,
        )
        logits = self.output_head.logits(sync)
        probs = self.output_head(sync)
        return CTMOutput(logits=logits, probs=probs, confidence=log.confidence,
                         tick_count=log.ticks_run, log=log)

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    @classmethod
    def serialize(cls) -> ModelManifest:
        cfg = CTMConfig()
        return ModelManifest(
            name="Continuous Thought Model",
            slug="ctm",
            description=(
                "Iterative tick-loop architecture with sync-driven attention. "
                "Neuron state accumulates across ticks before committing to an output — "
                "trades parameter efficiency for internal reasoning depth."
            ),
            hyperparams={
                "n_neurons": cfg.n_neurons,
                "embed_dim": cfg.embed_dim,
                "query_dim": cfg.query_dim,
                "value_dim": cfg.value_dim,
                "hidden_dim": cfg.hidden_dim,
                "n_classes": cfg.n_classes,
                "max_ticks": cfg.max_ticks,
                "confidence_threshold": cfg.confidence_threshold,
            },
            parameterCount=cls(cfg).count_parameters(),
            module="ctm",
            modelClass="ContinuousThoughtModel",
            configClass="CTMConfig",
            graph=ArchitectureGraph(
                nodes=[
                    GraphNode(id="input",     type="io",         label="Input",          detail=f"{cfg.n_neurons} × {cfg.embed_dim}"),
                    GraphNode(id="sync_init", type="sync",       label="Sync Matrix",    detail=f"Pearson correlation · {cfg.n_neurons}×{cfg.n_neurons}"),
                    GraphNode(
                        id="tick_loop", type="loop",
                        label="Tick Loop",
                        detail=f"max {cfg.max_ticks} ticks · exits when confidence ≥ {cfg.confidence_threshold}",
                        nodes=[
                            GraphNode(id="tl_attn", type="attention",  label="Sync Attention",  detail=f"query from sync · K/V from context · dim {cfg.query_dim}"),
                            GraphNode(id="tl_sync", type="sync",       label="Recompute Sync",  detail=f"Pearson correlation · {cfg.n_neurons}×{cfg.n_neurons}"),
                            GraphNode(id="tl_conf", type="confidence", label="Confidence Gate", detail=f"hidden {cfg.hidden_dim} · threshold {cfg.confidence_threshold}"),
                        ],
                    ),
                    GraphNode(id="out_head", type="linear", label="Output Head", detail=f"{cfg.n_neurons}×{cfg.n_neurons} sync → hidden {cfg.hidden_dim} → {cfg.n_classes}"),
                    GraphNode(id="output",   type="io",     label="Output",      detail=f"{cfg.n_classes} logits"),
                ],
                edges=[
                    GraphEdge(**{"from": "input",     "to": "sync_init"}),
                    GraphEdge(**{"from": "sync_init", "to": "tick_loop"}),
                    GraphEdge(**{"from": "tick_loop", "to": "out_head"}),
                    GraphEdge(**{"from": "out_head",  "to": "output"}),
                ],
            ),
        )
