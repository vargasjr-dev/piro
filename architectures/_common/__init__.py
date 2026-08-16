"""Shared contracts and training utilities for our architectures."""

from .base import ArchitectureModel, json_state, load_architecture
from .trainer import Trainer, TrainerConfig

__all__ = [
    "ArchitectureModel",
    "json_state",
    "load_architecture",
    "Trainer",
    "TrainerConfig",
]
