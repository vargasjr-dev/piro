"""
piro/layer.py

PiroLayer — base class for all serializable layers in a Piro model.

Extends nn.Module so instances participate in the standard PyTorch training
loop (parameter tracking, .to(device), state_dict, etc.).  The serialize()
classmethod describes the layer in the architecture graph, letting
serialize_graph() delegate node construction to the layer class.

Usage
-----
Subclass PiroLayer for any discrete processing step that should appear as a
node in the architecture graph:

    class MyLayer(PiroLayer):
        def forward(self, x: torch.Tensor) -> torch.Tensor:
            ...

        @classmethod
        def serialize(cls, **kwargs) -> GraphNode:
            return GraphNode(id="my_layer", type="reshape", label="My Layer")

Then use it in the model:

    class MyModel(PiroModel):
        def __init__(self):
            super().__init__()
            self.my_layer = MyLayer()

        def forward(self, x):
            return self.my_layer(x)

        @classmethod
        def serialize_graph(cls):
            node = cls.my_layer_cls.serialize()
            ...
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import torch
import torch.nn as nn

from .schema import GraphNode


class PiroLayer(nn.Module, ABC):
    """Abstract base class for serializable Piro layers."""

    @classmethod
    @abstractmethod
    def serialize(cls, **kwargs: Any) -> GraphNode:
        """Return a GraphNode describing this layer in the architecture graph.

        Subclasses must override this.  keyword arguments are model-specific.
        """
        ...


class EnsureSequence(PiroLayer):
    """Normalize input shape to (N, embed_dim) before entering transformer layers.

    Accepts:
        (embed_dim,)     → unsqueezes to (1, embed_dim)   [single embedding]
        (N, embed_dim)   → passes through unchanged        [sequence]
        anything else    → raises ValueError immediately

    Has no learnable parameters — purely a shape contract enforcer.
    """

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.ndim == 2:
            return x
        elif x.ndim == 1:
            return x.unsqueeze(0)
        else:
            raise ValueError(f"Expected embeddings with 1 or 2 dims, got {x.ndim}")

    @classmethod
    def serialize(cls, **_: Any) -> GraphNode:
        return GraphNode(
            id="ensure_seq",
            type="reshape",
            label="Ensure Sequence",
            detail="(embed_dim,) → (1, embed_dim)",
        )
