"""
model/trainer.py

Shared Trainer — trains either ContinuousThoughtModel or BaselineTransformer
with an identical loop, optimizer, and data pipeline for fair comparison.

Both models share a common interface:
    model(embeddings: Tensor) -> Tensor   (logits, shape: n_classes)

The Trainer wraps that interface and runs:
    - Cross-entropy loss
    - Adam optimiser (configurable lr / weight_decay)
    - Identical train/eval split from the data pipeline
    - Per-epoch metrics: train_loss, val_loss, val_accuracy

Usage
-----
    from piro.trainer import Trainer, TrainerConfig
    from model.ctm import ContinuousThoughtModel, CTMConfig
    from model.baseline_transformer import BaselineTransformer, TransformerConfig

    # Build models
    ctm  = ContinuousThoughtModel(CTMConfig())
    base = BaselineTransformer(TransformerConfig())

    # Shared trainer config
    cfg = TrainerConfig(epochs=20, lr=1e-3, batch_size=32, seed=42)

    # Train both on the same data
    ctm_history  = Trainer(ctm,  cfg).fit(train_data, val_data)
    base_history = Trainer(base, cfg).fit(train_data, val_data)

Data format
-----------
Each dataset is a list of (embeddings, label) pairs where:
    embeddings : torch.Tensor  shape (N, embed_dim) or (embed_dim,)
    label      : int           ground-truth class index
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Protocol

import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Common model interface ────────────────────────────────────────────────────

class ModelProtocol(Protocol):
    """Minimal interface both CTM and BaselineTransformer satisfy."""

    def __call__(self, embeddings: torch.Tensor) -> torch.Tensor:
        """Return raw logits, shape (n_classes,)."""
        ...

    def parameters(self):  # type: ignore[override]
        ...

    def train(self, mode: bool = True) -> "ModelProtocol":
        ...

    def eval(self) -> "ModelProtocol":
        ...


# ── Config ────────────────────────────────────────────────────────────────────

@dataclass
class TrainerConfig:
    epochs: int = 10
    lr: float = 1e-3
    weight_decay: float = 1e-4
    batch_size: int = 32
    seed: int = 42
    log_every: int = 1          # print metrics every N epochs (0 = silent)


# ── Per-epoch metrics ─────────────────────────────────────────────────────────

@dataclass
class EpochMetrics:
    epoch: int
    train_loss: float
    val_loss: float
    val_accuracy: float


# ── Dataset type alias ────────────────────────────────────────────────────────

Sample = tuple[torch.Tensor, int]   # (embeddings, label)
Dataset = list[Sample]


# ── Trainer ───────────────────────────────────────────────────────────────────

class Trainer:
    """Trains a model (CTM or BaselineTransformer) with a fixed loop.

    Both models are adapted to a common logit-returning interface:

        CTM:                 model(emb) → CTMOutput  →  .logits extracted
        BaselineTransformer: model(emb) → Tensor (logits directly)

    The adapter is transparent — callers just pass the model as-is.

    Parameters
    ----------
    model : nn.Module
        ContinuousThoughtModel or BaselineTransformer (or any nn.Module whose
        forward returns either a Tensor of logits or an object with .logits).
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

    def fit(self, train_data: Dataset, val_data: Dataset) -> list[EpochMetrics]:
        """Train for `config.epochs` epochs and return per-epoch history.

        Parameters
        ----------
        train_data : Dataset
        val_data   : Dataset

        Returns
        -------
        list[EpochMetrics]
            One entry per epoch.
        """
        _seed_everything(self.config.seed)
        history: list[EpochMetrics] = []

        for epoch in range(1, self.config.epochs + 1):
            train_loss = self._train_epoch(train_data)
            val_loss, val_acc = self._eval_epoch(val_data)

            metrics = EpochMetrics(
                epoch=epoch,
                train_loss=train_loss,
                val_loss=val_loss,
                val_accuracy=val_acc,
            )
            history.append(metrics)

            if self.config.log_every > 0 and epoch % self.config.log_every == 0:
                print(
                    f"[epoch {epoch:>3}/{self.config.epochs}] "
                    f"train_loss={train_loss:.4f}  "
                    f"val_loss={val_loss:.4f}  "
                    f"val_acc={val_acc:.3f}"
                )

        return history

    # ── Internal ──────────────────────────────────────────────────────────────

    def _train_epoch(self, data: Dataset) -> float:
        self.model.train()
        random.shuffle(data)
        total_loss = 0.0

        for batch in _batch(data, self.config.batch_size):
            self.optimizer.zero_grad()
            loss = self._batch_loss(batch)
            loss.backward()
            self.optimizer.step()
            total_loss += loss.item()

        n_batches = max(1, len(data) // self.config.batch_size)
        return total_loss / n_batches

    def _eval_epoch(self, data: Dataset) -> tuple[float, float]:
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
    """Extract a flat logit tensor from either model type."""
    out = model(embeddings)
    # CTMOutput has .logits; BaselineTransformer returns Tensor directly
    if isinstance(out, torch.Tensor):
        return out
    return out.logits  # type: ignore[union-attr]


def _batch(data: Dataset, size: int):
    for i in range(0, len(data), size):
        yield data[i : i + size]


def _seed_everything(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
