"""
piro/schema.py

Canonical Pydantic schema for ModelManifest — the typed return value of
PiroModel.serialize().  This is the contract between model classes stored in R2
and the Piro platform (serialize endpoint, UI, future tooling).

JSON serialisation uses camelCase aliases so the output is directly consumable
by the TypeScript frontend without any transformation.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Node / graph types ────────────────────────────────────────────────────────

GraphNodeType = Literal[
    "io",
    "norm",
    "attention",
    "ffn",
    "residual",
    "pool",
    "linear",
    "loop",
    "confidence",
    "sync",
]


class GraphNode(BaseModel):
    """A single node in the architecture flow graph."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: GraphNodeType
    label: str
    detail: Optional[str] = None
    group: Optional[str] = None
    # Interior nodes — only valid when type == "loop"
    nodes: Optional[list[GraphNode]] = None


# Pydantic needs the model to be rebuilt after self-referencing definition
GraphNode.model_rebuild()


class GraphEdge(BaseModel):
    """A directed edge between two graph nodes.

    ``from`` is a Python keyword, so the field is named ``from_`` in Python
    and serialised as ``from`` in JSON via the alias.
    """

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str


class ArchitectureGraph(BaseModel):
    """Full directed graph describing the model's forward-pass architecture."""

    nodes: list[GraphNode]
    edges: list[GraphEdge]


# ── Top-level manifest ────────────────────────────────────────────────────────

class ModelManifest(BaseModel):
    """Complete description of a Piro model class.

    Returned by ``PiroModel.serialize()`` and consumed by the serialize
    endpoint, the class detail UI, and future tooling.

    camelCase aliases are used in JSON so the frontend can consume this
    directly without transformation.
    """

    model_config = ConfigDict(populate_by_name=True)

    name: str
    slug: str
    description: str
    hyperparams: dict[str, Any]
    parameter_count: int = Field(alias="parameterCount")
    module: str
    model_class: str = Field(alias="modelClass")
    graph: Optional[ArchitectureGraph] = None
