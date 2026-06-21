"""
piro/base.py

PiroModel — base class for all model classes stored in R2 and run on Modal.

Model authors subclass this, define a handful of class attributes, and
implement two methods:

    build_default()    — return cls(YourConfig()) with default hyperparameters
    serialize_graph()  — return an ArchitectureGraph describing the forward pass

Everything else — serialize(), count_parameters() — is inherited.

Example
-------
    from piro import PiroModel
    from piro.schema import ArchitectureGraph, GraphNode, GraphEdge

    class MyModel(PiroModel):
        # ── Manifest fields ───────────────────────────────────────────────
        name         = "My Model"
        slug         = "my-model"
        description  = "One-line description."
        module       = "my_module"        # Python module name
        config_class = "MyConfig"         # Name of the config dataclass
        hyper_parameters = {              # Default config values (display + manifest)
            "hidden_dim": 64,
            "n_classes": 10,
        }

        # ── Required implementations ──────────────────────────────────────
        @classmethod
        def build_default(cls) -> "MyModel":
            return cls(MyConfig())

        @classmethod
        def serialize_graph(cls) -> ArchitectureGraph:
            hp = cls.hyper_parameters
            return ArchitectureGraph(
                nodes=[...],
                edges=[...],
            )

        # ── nn.Module interface ───────────────────────────────────────────
        def __init__(self, config: MyConfig) -> None:
            super().__init__()
            ...

        def forward(self, x):
            ...
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

import torch.nn as nn

from .schema import ArchitectureGraph, ModelManifest


class PiroModel(nn.Module, ABC):
    """Abstract base class for Piro model classes.

    Define class attributes and implement ``build_default`` +
    ``serialize_graph``.  Everything else is inherited.
    """

    # ── Required class attributes ──────────────────────────────────────────────
    # Declare these directly on your subclass (no __init__ needed for them).

    name: str                           # Display name, e.g. "Baseline Transformer"
    slug: str                           # URL-safe identifier, e.g. "baseline-transformer"
    description: str                    # One-paragraph description
    module: str                         # Python module name, e.g. "baseline_transformer"
    config_class: str                   # Config dataclass name, e.g. "TransformerConfig"
    hyper_parameters: dict[str, Any]    # Default hyperparameter values

    # ── Required implementations ───────────────────────────────────────────────

    @classmethod
    @abstractmethod
    def build_default(cls) -> "PiroModel":
        """Return a default-configured instance used to count parameters.

        Implement as a one-liner::

            @classmethod
            def build_default(cls) -> "MyModel":
                return cls(MyConfig())
        """
        ...

    @classmethod
    @abstractmethod
    def serialize_graph(cls) -> Optional[ArchitectureGraph]:
        """Return an ArchitectureGraph describing the forward pass, or None.

        Read default values from ``cls.hyper_parameters`` so the graph stays
        in sync with the declared defaults automatically.
        """
        ...

    # ── Provided by base — do not override ────────────────────────────────────

    def count_parameters(self) -> int:
        """Count all trainable scalar parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    @classmethod
    def serialize(cls) -> ModelManifest:
        """Build and return a fully-populated ModelManifest.

        Called by the Piro serialize endpoint. Result is cached by source hash
        in Modal — no need to make this fast beyond a single forward pass.
        """
        return ModelManifest(
            name=cls.name,
            slug=cls.slug,
            description=cls.description,
            hyperparams=cls.hyper_parameters,
            parameterCount=cls.build_default().count_parameters(),
            module=cls.module,
            modelClass=cls.__name__,
            configClass=cls.config_class,
            graph=cls.serialize_graph(),
        )
