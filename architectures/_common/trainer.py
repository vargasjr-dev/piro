"""
architectures/_common/trainer.py

Shared Trainer for Ashfall model architectures.

The trainer accepts a model whose forward pass returns an object with a
``logits`` tensor, such as ``Ashfall``.

The Trainer wraps that interface and runs:
    - Cross-entropy loss
    - Adam optimiser (configurable lr / weight_decay)
    - Identical train/eval split from the data pipeline
    - Periodic metrics: train_loss, val_loss, val_accuracy

Usage
-----
    from architectures._common.trainer import Trainer, TrainerConfig
    from architectures.ashfall.ctm_10x import Ashfall, CTMConfig
    # Build the model
    ctm = Ashfall(CTMConfig())

    # Shared trainer config
    cfg = TrainerConfig(max_steps=5000, lr=1e-3, batch_size=32, seed=42)

    ctm_history = Trainer(ctm, cfg).fit(train_data, val_data)

Data format
-----------
Each dataset is a list of (embeddings, label) pairs where:
    embeddings : torch.Tensor  shape (N, embed_dim) or (embed_dim,)
    label      : int           ground-truth class index
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Protocol

import torch
import torch.nn as nn
import torch.nn.functional as F

# ── Common model interface ────────────────────────────────────────────────────


class ModelProtocol(Protocol):
    """Minimal interface an Ashfall model satisfies."""

    def __call__(self, embeddings: torch.Tensor) -> torch.Tensor:
        """Return raw logits, shape (n_classes,)."""
        ...

    def parameters(self):  # type: ignore[override]
        ...

    def train(self, mode: bool = True) -> ModelProtocol: ...

    def eval(self) -> ModelProtocol: ...


# ── Config ────────────────────────────────────────────────────────────────────


@dataclass
class TrainerConfig:
    max_steps: int = 5000
    lr: float = 1e-3
    weight_decay: float = 1e-4
    batch_size: int = 32
    seed: int = 42
    eval_interval: int = 250  # evaluate and record metrics every N steps


# ── Step metrics ───────────────────────────────────────────────────────────────


@dataclass
class StepMetrics:
    step: int
    train_loss: float
    val_loss: float
    val_accuracy: float


# ── Dataset type alias ────────────────────────────────────────────────────────

Sample = tuple[torch.Tensor, int]  # (embeddings, label)
Dataset = list[Sample]


# ── Trainer ───────────────────────────────────────────────────────────────────


class Trainer:
    """Trains an Ashfall model with a fixed loop.

    The model forward pass returns a CTM-style output object with a ``logits``
    tensor.

    Parameters
    ----------
    model : nn.Module
        An Ashfall model whose forward pass returns an object with ``logits``.
    config : TrainerConfig
    """

    def __init__(self, model: nn.Module, config: TrainerConfig) -> None:
        self.model = model
        self.config = config
        self.optimizer = torch.optim.Adam(
            model.parameters(),
            lr=config.lr,
            weight_decay=config.weight_decay,
        )

    # ── Public API ────────────────────────────────────────────────────────────

    def fit(self, train_data: Dataset, val_data: Dataset) -> list[StepMetrics]:
        """Train for a fixed optimizer-step budget and return evaluation history."""
        if self.config.max_steps <= 0:
            raise ValueError("max_steps must be positive")
        if self.config.batch_size <= 0:
            raise ValueError("batch_size must be positive")
        if self.config.eval_interval <= 0:
            raise ValueError("eval_interval must be positive")
        if not train_data:
            raise ValueError("train_data must not be empty")

        _seed_everything(self.config.seed)
        history: list[StepMetrics] = []
        order = list(range(len(train_data)))
        cursor = 0

        for step in range(1, self.config.max_steps + 1):
            if cursor == 0:
                random.shuffle(order)
            batch_indices = [
                order[(cursor + offset) % len(order)]
                for offset in range(min(self.config.batch_size, len(order)))
            ]
            cursor = (cursor + len(batch_indices)) % len(order)
            batch = [train_data[index] for index in batch_indices]
            train_loss = self._train_step(batch)

            if step % self.config.eval_interval != 0 or step == self.config.max_steps:
                continue

            val_loss, val_acc = self._evaluate(val_data)
            metrics = StepMetrics(
                step=step,
                train_loss=train_loss,
                val_loss=val_loss,
                val_accuracy=val_acc,
            )
            history.append(metrics)
            print(
                f"[step {step:>6}/{self.config.max_steps}] "
                f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f}  "
                f"val_acc={val_acc:.3f}"
            )

        return history

    # ── Internal ──────────────────────────────────────────────────────────────

    def _train_step(self, batch: list[Sample]) -> float:
        self.model.train()
        self.optimizer.zero_grad()
        loss = self._batch_loss(batch)
        loss.backward()
        self.optimizer.step()
        return float(loss.detach())

    def _evaluate(self, data: Dataset) -> tuple[float, float]:
        self.model.eval()
        total_loss = 0.0
        correct = 0

        with torch.no_grad():
            for emb, label in data:
                logits = _get_logits(self.model, emb)
                loss = F.cross_entropy(logits.unsqueeze(0), torch.tensor([label]))
                total_loss += loss.item()
                if logits.argmax().item() == label:
                    correct += 1

        n = max(1, len(data))
        return total_loss / n, correct / n

    def _batch_loss(self, batch: list[Sample]) -> torch.Tensor:
        losses = []
        for emb, label in batch:
            logits = _get_logits(self.model, emb)
            losses.append(F.cross_entropy(logits.unsqueeze(0), torch.tensor([label])))
        return torch.stack(losses).mean()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_logits(model: nn.Module, embeddings: torch.Tensor) -> torch.Tensor:
    """Extract a flat logit tensor from an Ashfall model output."""
    return model(embeddings).logits  # type: ignore[union-attr]


def _batch(data: Dataset, size: int):
    for i in range(0, len(data), size):
        yield data[i : i + size]


def _seed_everything(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
