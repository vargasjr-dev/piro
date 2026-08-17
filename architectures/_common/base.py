"""Shared model contract for architecture-owned training and inference behavior."""

from __future__ import annotations

import dataclasses
import importlib
import inspect
from abc import ABC, abstractmethod
from typing import Any, Callable, ClassVar, Self

import torch
import torch.nn as nn


class ArchitectureModel(nn.Module, ABC):
    """One architecture-owned model API used by training and inference.

    Platform code may construct, move, checkpoint, and optimize a model, but
    architecture-specific interpretation of examples and input packets stays here.
    """

    name: ClassVar[str]
    slug: ClassVar[str]
    description: ClassVar[str]
    module: ClassVar[str]
    hyper_parameters: ClassVar[dict[str, Any]]
    config_type: ClassVar[type[Any] | None] = None
    training_batch_size: ClassVar[int] = 32
    optimizer_learning_rate: ClassVar[float] = 1e-3
    optimizer_weight_decay: ClassVar[float] = 1e-4

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if "HyperParameters" in cls.__dict__:
            hp_cls = cls.__dict__["HyperParameters"]
            if not dataclasses.is_dataclass(hp_cls):
                hp_cls = dataclasses.dataclass(hp_cls)
                cls.HyperParameters = hp_cls
            cls.hyper_parameters = {
                field.name: field.default
                for field in dataclasses.fields(hp_cls)
                if field.default is not dataclasses.MISSING
            }

    @classmethod
    def from_config(cls, config: dict[str, Any] | None = None) -> Self:
        """Construct this architecture from persisted JSON configuration."""
        values = config or {}
        config_type = cls.config_type
        if config_type is None:
            return cls(**values)
        fields = {field.name for field in dataclasses.fields(config_type)}
        model_config = config_type(**{key: value for key, value in values.items() if key in fields})
        return cls(model_config)

    @classmethod
    def config_for_training(cls, examples: list[Any]) -> dict[str, Any]:
        """Return model configuration for neutral, source-decoded examples."""
        del examples
        return {}

    def config_dict(self) -> dict[str, Any]:
        config = getattr(self, "config", None)
        if dataclasses.is_dataclass(config):
            return dataclasses.asdict(config)
        if isinstance(config, dict):
            return dict(config)
        return {}

    def training_example_diagnostics(self, example: Any) -> dict[str, Any]:
        """Return bounded, non-content diagnostics for one training example."""
        del example
        return {}

    def optimizer_kwargs(self) -> dict[str, float]:
        return {
            "lr": self.optimizer_learning_rate,
            "weight_decay": self.optimizer_weight_decay,
        }

    def train_step(
        self,
        batch: list[Any],
        optimizer: torch.optim.Optimizer,
        *,
        on_phase: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> float:
        """Run one optimizer step and report bounded operation breadcrumbs."""
        def phase(name: str, **details: Any) -> None:
            if on_phase is None:
                return
            if torch.cuda.is_available():
                details.update(
                    cudaMemoryAllocatedMb=round(torch.cuda.memory_allocated() / 1024 / 1024, 1),
                    cudaMemoryReservedMb=round(torch.cuda.memory_reserved() / 1024 / 1024, 1),
                    cudaMaxMemoryAllocatedMb=round(torch.cuda.max_memory_allocated() / 1024 / 1024, 1),
                    cudaMaxMemoryReservedMb=round(torch.cuda.max_memory_reserved() / 1024 / 1024, 1),
                )
            on_phase(name, details)

        def synchronize(name: str) -> None:
            if on_phase is None or not torch.cuda.is_available():
                return
            phase(f"{name}_sync_started")
            torch.cuda.synchronize()
            phase(f"{name}_sync_completed")

        self.train()
        phase("train_mode_set", batchSize=len(batch))
        optimizer.zero_grad()
        phase("gradients_zeroed")
        losses: list[torch.Tensor] = []
        for index, example in enumerate(batch):
            phase("example_started", exampleIndex=index)
            example_details = self.training_example_diagnostics(example)
            phase("example_prepared", exampleIndex=index, **example_details)
            phase("example_loss_started", exampleIndex=index, **example_details)
            loss = self.training_loss(example)
            phase("example_loss_returned", exampleIndex=index, **example_details)
            synchronize("example_loss")
            if loss.ndim != 0:
                raise ValueError(f"training loss must be scalar, got shape {tuple(loss.shape)}")
            losses.append(loss)
            detached_loss = loss.detach()
            phase(
                "example_loss_ready",
                exampleIndex=index,
                loss=float(detached_loss),
                lossFinite=bool(torch.isfinite(detached_loss).item()),
                **example_details,
            )
        phase("loss_stack_started", lossCount=len(losses))
        loss = torch.stack(losses).mean()
        phase("loss_stack_completed", lossCount=len(losses))
        detached_loss = loss.detach()
        phase(
            "loss_ready",
            loss=float(detached_loss),
            lossFinite=bool(torch.isfinite(detached_loss).item()),
        )
        phase("backward_started")
        loss.backward()
        phase("backward_returned")
        synchronize("backward")
        phase("backward_completed")
        phase("optimizer_started")
        optimizer.step()
        phase("optimizer_returned")
        synchronize("optimizer")
        phase("optimizer_completed")
        return float(loss.detach())

    @abstractmethod
    def training_loss(self, example: Any) -> torch.Tensor:
        """Return one differentiable loss for a neutral source example."""

    @abstractmethod
    def invoke(
        self,
        input_packet: dict[str, Any],
        state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Invoke the architecture on one structured PiroInput packet."""

    def load_model_state(self, state: dict[str, Any]) -> None:
        self.load_state_dict(state)
        reset = getattr(self, "reset", None)
        if callable(reset):
            reset()

    def checkpoint_state(self) -> dict[str, Any]:
        return {}

    def load_checkpoint_state(self, state: dict[str, Any]) -> None:
        del state

    def count_parameters(self) -> int:
        return sum(parameter.numel() for parameter in self.parameters() if parameter.requires_grad)

    def parameter_count(self) -> int:
        return sum(parameter.numel() for parameter in self.parameters())


def load_architecture(path: str) -> type[ArchitectureModel]:
    """Resolve a canonical ``architectures/<name>/main.py`` to its model class."""
    normalized = path.strip().strip("/")
    if normalized.endswith(".py"):
        normalized = normalized[:-3]
    if normalized.rsplit("/", 1)[-1] != "main":
        normalized = f"{normalized}/main"
    if not normalized.startswith("architectures/"):
        raise ValueError(f"expected an architectures/.../main.py path, got {path!r}")
    module_name = normalized.replace("/", ".")
    module = importlib.import_module(module_name)
    candidates = [
        candidate
        for _, candidate in inspect.getmembers(module, inspect.isclass)
        if candidate is not ArchitectureModel
        and issubclass(candidate, ArchitectureModel)
        and candidate.__module__ != ArchitectureModel.__module__
    ]
    if len(candidates) != 1:
        names = ", ".join(candidate.__name__ for candidate in candidates) or "none"
        raise ValueError(f"{path!r} must expose exactly one ArchitectureModel subclass; found {names}")
    return candidates[0]


def json_state(value: Any) -> Any:
    """Convert tensor-containing architecture state into JSON-safe values."""
    if hasattr(value, "detach"):
        return value.detach().cpu().tolist()
    if isinstance(value, dict):
        return {key: json_state(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_state(item) for item in value]
    return value
