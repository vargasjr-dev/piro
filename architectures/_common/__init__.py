"""Shared contracts and training utilities for our architectures."""

from .base import ArchitectureModel
from .schema import ArchitectureGraph, GraphEdge, GraphNode, ModelManifest
from .trainer import StepMetrics, Trainer, TrainerConfig

__all__ = [
    "ArchitectureGraph",
    "GraphEdge",
    "GraphNode",
    "ModelManifest",
    "ArchitectureModel",
    "StepMetrics",
    "Trainer",
    "TrainerConfig",
]
