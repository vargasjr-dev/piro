"""
piro/base.py

ArchitectureModel — base class for all model classes stored in R2 and run on Modal.

Model authors subclass this, define class attributes, and implement one
method.  Everything else — serialize(), count_parameters() — is inherited.

The base calls cls(**cls.hyper_parameters) to instantiate a default model,
so __init__ must accept keyword arguments matching the hyper_parameters keys.

Two styles for hyperparameters
──────────────────────────────

Style 1 — plain dict (simple, no extras):

    class MyModel(ArchitectureModel):
        hyper_parameters = {"hidden_dim": 64, "n_classes": 10}

        def __init__(self, hidden_dim=64, n_classes=10):
            super().__init__()
            ...

Style 2 — typed nested class (IDE-friendly, zero extra imports):

    class MyModel(ArchitectureModel):
        class HyperParameters:
            hidden_dim: int = 64
            n_classes: int  = 10
        # hyper_parameters dict is auto-derived — do not define manually

        def __init__(self, hidden_dim=64, n_classes=10):
            super().__init__()
            hp = type(self).HyperParameters(hidden_dim=hidden_dim, n_classes=n_classes)
            ...  # typed access via hp.hidden_dim etc.

In either style, serialize_graph() reads from cls.hyper_parameters — the base
ensures this dict is always populated regardless of which style is used.
"""

from __future__ import annotations

import dataclasses
from abc import ABC, abstractmethod
from typing import Any

import torch.nn as nn

from .schema import ArchitectureGraph, ModelManifest


class ArchitectureModel(nn.Module, ABC):
    """Abstract base class for architecture model classes."""

    # ── Required class attributes ──────────────────────────────────────────────
    name: str  # Display name, e.g. "Baseline Transformer"
    slug: str  # URL-safe identifier, e.g. "baseline-transformer"
    description: str  # One-paragraph description
    module: str  # Python module name, e.g. "baseline_transformer"
    hyper_parameters: dict[
        str, Any
    ]  # Populated from dict literal OR auto-derived from HyperParameters

    # ── Auto-setup ─────────────────────────────────────────────────────────────

    def __init_subclass__(cls, **kwargs: Any) -> None:
        """Auto-apply @dataclass to a nested HyperParameters class and derive
        the hyper_parameters dict from its field defaults.

        This runs once per subclass definition, so it's free at runtime.
        """
        super().__init_subclass__(**kwargs)
        if "HyperParameters" in cls.__dict__:
            hp_cls = cls.__dict__["HyperParameters"]
            if not dataclasses.is_dataclass(hp_cls):
                hp_cls = dataclasses.dataclass(hp_cls)
                cls.HyperParameters = hp_cls
            cls.hyper_parameters = {
                f.name: f.default
                for f in dataclasses.fields(hp_cls)
                if f.default is not dataclasses.MISSING
            }

    # ── Required implementations ───────────────────────────────────────────────

    @classmethod
    @abstractmethod
    def serialize_graph(cls) -> ArchitectureGraph | None:
        """Return an ArchitectureGraph describing the forward pass, or None.

        Always read defaults from cls.hyper_parameters — works in both styles.
        """
        ...

    # ── Provided by base — do not override ────────────────────────────────────

    def count_parameters(self) -> int:
        """Count all trainable scalar parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    @classmethod
    def serialize(cls) -> ModelManifest:
        """Build and return a fully-populated ModelManifest.

        Called by the Piro serialize endpoint.  Result is cached by source hash
        in Modal — no need to make this fast beyond a single forward pass.
        """
        return ModelManifest(
            name=cls.name,
            slug=cls.slug,
            description=cls.description,
            hyperparams=cls.hyper_parameters,
            parameterCount=cls(**cls.hyper_parameters).count_parameters(),
            module=cls.module,
            modelClass=cls.__name__,
            graph=cls.serialize_graph(),
        )
