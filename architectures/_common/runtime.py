"""Architecture-owned training runtime contracts and loading."""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class EvaluationResult:
    loss: float
    accuracy: float


class TrainingRuntime(Protocol):
    """Behavior an architecture entrypoint exposes to generic orchestration."""

    model: Any
    batch_size: int

    def config(self) -> dict[str, Any]: ...

    def load_dataset(
        self,
        *,
        r2_client: Any,
        bucket: str,
        source_path: str,
        dataset_prefix: str,
        split: str,
        limit: int,
    ) -> list[Any]: ...

    def train_step(self, batch: list[Any], *, step: int) -> float: ...

    def evaluate(self, data: list[Any]) -> EvaluationResult: ...

    def optimizer_state(self) -> Any: ...

    def load_optimizer_state(self, state: Any) -> None: ...

    def restore_optimizer_device(self, device: Any) -> None: ...

    def model_state(self) -> dict[str, Any]: ...

    def load_model_state(self, state: dict[str, Any]) -> None: ...

    def parameter_count(self) -> int: ...

    def checkpoint_state(self) -> dict[str, Any]: ...

    def load_checkpoint_state(self, state: dict[str, Any]) -> None: ...


def _module_name(path: str, *, package: str) -> str:
    normalized = path.strip().strip("/")
    if normalized.endswith(".py"):
        normalized = normalized[:-3]
    if normalized.rsplit("/", 1)[-1] != "main":
        normalized = f"{normalized}/main"
    if not normalized.startswith(f"{package}/"):
        raise ValueError(f"expected a {package}/.../main.py path, got {path!r}")
    return normalized.replace("/", ".")


def load_training_runtime(
    *, architecture_path: str, source_path: str, device: Any, seed: int
) -> TrainingRuntime:
    """Load the canonical architecture entrypoint's training implementation."""
    module = importlib.import_module(_module_name(architecture_path, package="architectures"))
    factory = getattr(module, "create_training_runtime", None)
    if factory is None:
        raise ValueError(
            f"architecture entrypoint {architecture_path!r} does not expose "
            "create_training_runtime"
        )
    return factory(source_path=source_path, device=device, seed=seed)
