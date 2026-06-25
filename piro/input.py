"""
piro/input.py

PiroInput — base class for model inputs.

Extends torch.Tensor so instances can be used directly in a model's forward
pass without any unwrapping.  The serialize() classmethod describes the input
in the architecture graph, letting serialize_graph() delegate input-node
construction to the input class rather than hard-coding it.

Usage
-----
Define a concrete subclass for each input shape/meaning:

    class TransformerInput(PiroInput):
        @classmethod
        def serialize(cls, *, embed_dim: int) -> GraphNode:
            return GraphNode(
                id="input", type="io", label="Input",
                detail=f"seq × {embed_dim}",
            )

Then attach it to the model class:

    class MyTransformer(PiroModel):
        input = TransformerInput

        @classmethod
        def serialize_graph(cls) -> ArchitectureGraph:
            input_node = cls.input.serialize(embed_dim=cls.hyper_parameters["embed_dim"])
            ...
"""

from __future__ import annotations

from typing import Any

import torch

from .schema import GraphNode


class PiroInput(torch.Tensor):
    """Base class for Piro model inputs.

    Subclasses torch.Tensor so instances are valid tensors in the forward pass.
    Each subclass must implement serialize() to contribute its node(s) to the
    architecture graph.
    """

    @staticmethod
    def __new__(cls, data: torch.Tensor) -> "PiroInput":
        return torch.Tensor._make_subclass(cls, data)  # type: ignore[return-value]

    @classmethod
    def serialize(cls, **kwargs: Any) -> GraphNode:
        """Return a GraphNode describing this input in the architecture graph.

        Subclasses must override this.  keyword arguments are model-specific
        (e.g. embed_dim for transformer inputs).
        """
        raise NotImplementedError(f"{cls.__name__} must implement serialize()")



