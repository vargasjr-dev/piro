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


def json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    raise TypeError(f"Architecture metadata contains unsupported value: {value!r}")


def discover() -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    for entrypoint in sorted(ARCHITECTURES.glob("*/main.py")):
        architecture = entrypoint.parent.name
        module = importlib.import_module(f"architectures.{architecture}.main")
        model_class = getattr(module, "MODEL_CLASS", None)
        if model_class is None:
            raise RuntimeError(f"{entrypoint} must export MODEL_CLASS")

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
