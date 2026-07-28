"""Emit manifests for every canonical architecture entrypoint."""

from __future__ import annotations

import importlib
import inspect
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
ARCHITECTURES = ROOT / "architectures"
sys.path.insert(0, str(ROOT))

from architectures._common.base import ArchitectureModel


def json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    raise TypeError(f"Architecture metadata contains unsupported value: {value!r}")


def implementation_class(module: Any, entrypoint: Path) -> type[ArchitectureModel]:
    candidates = [
        candidate
        for _, candidate in inspect.getmembers(module, inspect.isclass)
        if candidate is not ArchitectureModel
        and issubclass(candidate, ArchitectureModel)
    ]
    if len(candidates) != 1:
        names = ", ".join(candidate.__name__ for candidate in candidates) or "none"
        raise RuntimeError(
            f"{entrypoint} must expose exactly one ArchitectureModel subclass; found {names}"
        )
    return candidates[0]


def discover() -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    for entrypoint in sorted(ARCHITECTURES.glob("*/main.py")):
        architecture = entrypoint.parent.name
        module = importlib.import_module(f"architectures.{architecture}.main")
        model_class = implementation_class(module, entrypoint)
        model = model_class()
        source_path = Path(inspect.getfile(model_class)).resolve().relative_to(ROOT)
        manifests.append(
            {
                "entrypointPath": str(entrypoint.relative_to(ROOT)),
                "sourcePath": str(source_path),
                "name": model_class.name,
                "slug": model_class.slug,
                "description": model_class.description,
                "hyperparams": json_safe(model_class.hyper_parameters),
                "parameterCount": model.count_parameters(),
                "module": model_class.__module__,
                "modelClass": model_class.__name__,
            }
        )
    return manifests


if __name__ == "__main__":
    try:
        print(json.dumps(discover()))
    except Exception as error:
        print(f"architecture discovery failed: {error}", file=sys.stderr)
        raise
