"""
Shared optimizer-step trainer for architecture models.

The trainer owns only the optimizer loop. Validation and benchmarking are
separate workflows because architecture inference may mutate model state.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class TrainerConfig:
    max_steps: int = 5000
    lr: float = 1e-3
    weight_decay: float = 1e-4
    batch_size: int = 32
    seed: int = 42


Sample = tuple[torch.Tensor, int]
Dataset = list[Sample]


class Trainer:
    """Train a model for a fixed optimizer-step budget."""

    def __init__(self, model: nn.Module, config: TrainerConfig) -> None:
        self.model = model
        self.config = config
        self.optimizer = torch.optim.Adam(
            model.parameters(),
            lr=config.lr,
            weight_decay=config.weight_decay,
        )

    def fit(self, train_data: Dataset) -> None:
        """Run optimizer steps without invoking inference-like evaluation."""
        if self.config.max_steps <= 0:
            raise ValueError("max_steps must be positive")
        if self.config.batch_size <= 0:
            raise ValueError("batch_size must be positive")
        if not train_data:
            raise ValueError("train_data must not be empty")

        _seed_everything(self.config.seed)
        order = list(range(len(train_data)))
        cursor = 0

        for _step in range(1, self.config.max_steps + 1):
            if cursor == 0:
                random.shuffle(order)
            batch_indices = [
                order[(cursor + offset) % len(order)]
                for offset in range(min(self.config.batch_size, len(order)))
            ]
            cursor = (cursor + len(batch_indices)) % len(order)
            batch = [train_data[index] for index in batch_indices]
            self._train_step(batch)

    def _train_step(self, batch: list[Sample]) -> float:
        self.model.train()
        self.optimizer.zero_grad()
        loss = self._batch_loss(batch)
        loss.backward()
        self.optimizer.step()
        return float(loss.detach())

    def _batch_loss(self, batch: list[Sample]) -> torch.Tensor:
        losses = []
        for emb, label in batch:
            logits = _get_logits(self.model, emb)
            losses.append(F.cross_entropy(logits.unsqueeze(0), torch.tensor([label])))
        return torch.stack(losses).mean()


def _get_logits(model: nn.Module, embeddings: torch.Tensor) -> torch.Tensor:
    """Extract a flat logit tensor from an architecture model output."""
    return model(embeddings).logits  # type: ignore[union-attr]


def _seed_everything(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
