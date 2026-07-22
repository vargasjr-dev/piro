"""Deterministic embeddings shared by persistent-memory training and evaluation."""

from __future__ import annotations

import hashlib
from typing import Any


def _hash_values(label: str, count: int) -> list[float]:
    digest = hashlib.sha256(label.encode("utf-8")).digest()
    return [((digest[index % len(digest)] / 255.0) * 2.0) - 1.0 for index in range(count)]


def memory_embedding(
    observation: str,
    dimension: int,
    *,
    torch_module: Any,
    dtype: Any = None,
    device: Any = None,
):
    """Encode a memory observation with shared key/value coordinates.

    Write observations place a deterministic key vector in the first half and
    value vector in the second half. Query observations reuse the key half and
    leave the value half empty, giving a stateful model a learnable retrieval
    boundary while keeping the public dataset role-free.
    """
    if dimension < 2:
        raise ValueError("memory embeddings require at least two dimensions")

    key_width = (dimension + 1) // 2
    value_width = dimension - key_width
    if observation.startswith("QUERY:"):
        observation = observation.removeprefix("QUERY:").strip()

    if "=" in observation:
        key, value = (part.strip() for part in observation.split("=", maxsplit=1))
        values = _hash_values(f"key:{key}", key_width) + _hash_values(
            f"value:{value}", value_width
        )
    elif observation.startswith("token_"):
        values = _hash_values(f"distractor:{observation}", dimension)
    else:
        values = _hash_values(f"key:{observation}", key_width) + [0.0] * value_width

    kwargs = {}
    if dtype is not None:
        kwargs["dtype"] = dtype
    if device is not None:
        kwargs["device"] = device
    return torch_module.tensor(values[:dimension], **kwargs)
