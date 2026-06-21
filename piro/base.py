"""
piro/base.py

PiroModel — base class for all model classes stored in R2 and run on Modal.

Model authors subclass this and implement:
  - forward()   : the standard nn.Module forward pass
  - serialize() : classmethod returning a ModelManifest that fully describes
                  the class for the Piro platform

Example
-------
    from piro import PiroModel
    from piro.schema import ModelManifest, ArchitectureGraph, GraphNode, GraphEdge

    class MyModel(PiroModel):
        def __init__(self, cfg):
            super().__init__()
            ...

        def forward(self, x):
            ...

        @classmethod
        def serialize(cls) -> ModelManifest:
            cfg = MyConfig()
            return ModelManifest(
                name="My Model",
                slug="my-model",
                description="...",
                hyperparams={"hidden_dim": cfg.hidden_dim},
                parameterCount=MyModel(cfg).count_parameters(),
                module="my_module",
                modelClass="MyModel",
                configClass="MyConfig",
            )
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import torch.nn as nn

from .schema import ModelManifest


class PiroModel(nn.Module, ABC):
    """Abstract base class for Piro model classes.

    Inherit from this instead of ``nn.Module`` directly so that the Piro
    platform can discover, introspect, and serialize your model class without
    any additional configuration.
    """

    @classmethod
    @abstractmethod
    def serialize(cls) -> ModelManifest:
        """Return a fully-populated ModelManifest describing this class.

        This method is called by the Piro serialize endpoint every time a
        model class page is loaded (result is cached by source hash in Modal).
        It should be fast — instantiate the model with default config only
        to count parameters, then return the manifest.
        """
        ...
