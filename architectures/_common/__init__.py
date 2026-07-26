"""Shared contracts and training utilities for our architectures."""

from .base import ArchitectureModel
from .trainer import StepMetrics, Trainer, TrainerConfig

__all__ = [
    "ArchitectureModel",
    "StepMetrics",
    "Trainer",
    "TrainerConfig",
]
