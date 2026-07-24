"""
piro — open source framework for building and training models on the Piro platform.

Built on PyTorch. Model authors subclass PiroModel, define hyperparameters,
and implement serialize_graph(). The Trainer handles the training loop;
piro.data and piro.benchmarks provide data generation and evaluation.

    from piro import PiroModel, Trainer, TrainerConfig
    from piro.schema import ModelManifest, ArchitectureGraph, GraphNode, GraphEdge

CLI
---
    piro train   — launch a training run on the Piro platform
    piro eval    — run benchmarks against a model
    piro deploy  — deploy a model class to the platform
"""

from .base import PiroModel
from .input import PiroInput
from .layer import PiroLayer
from .schema import ArchitectureGraph, GraphEdge, GraphNode, ModelManifest
from .trainer import Trainer, TrainerConfig, StepMetrics

__all__ = [
    "PiroModel",
    "PiroInput",
    "PiroLayer",
    "ModelManifest",
    "ArchitectureGraph",
    "GraphNode",
    "GraphEdge",
    "Trainer",
    "TrainerConfig",
    "StepMetrics",
]
