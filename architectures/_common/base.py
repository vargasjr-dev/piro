"""
piro/base.py

ArchitectureModel — base class for all model classes stored in R2 and run on Modal.

Model authors subclass this, define class attributes, and implement one
method.  Everything else — parameter-count helpers — is inherited.

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

In either style, the base ensures ``hyper_parameters`` is populated.

"""

from __future__ import annotations

import dataclasses
from abc import ABC
from typing import Any

import torch.nn as nn


class ArchitectureModel(nn.Module, ABC):
    """Abstract base class for architecture model classes."""

    # ── Required class attributes ──────────────────────────────────────────────
    name: str  # Display name, e.g. "Baseline Transformer"
    slug: str  # URL-safe identifier, e.g. "ashfall-ctm"
    description: str  # One-paragraph description
    module: str  # Python module name, e.g. "architectures.ashfall.ctm"
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

    def count_parameters(self) -> int:
        """Count all trainable scalar parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
