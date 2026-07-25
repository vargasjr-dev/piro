"""Deterministic embeddings shared by persistent-memory training and evaluation."""

from __future__ import annotations

import hashlib
from typing import Any


def _hash_values(label: str, count: int) -> list[float]:
    digest = hashlib.sha256(label.encode("utf-8")).digest()
    return [((digest[index % len(digest)] / 255.0) * 2.0) - 1.0 for index in range(count)]


def _tensor(values: list[float], dimension: int, *, torch_module: Any, dtype: Any, device: Any):
    kwargs = {}
    if dtype is not None:
        kwargs["dtype"] = dtype
    if device is not None:
        kwargs["device"] = device
    return torch_module.tensor(values[:dimension], **kwargs)


def memory_embedding(
    observation: str,
    dimension: int,
    *,
    torch_module: Any,
    dtype: Any = None,
    device: Any = None,
):
    """Encode an associative-memory observation with shared key/value coordinates."""
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

    return _tensor(values, dimension, torch_module=torch_module, dtype=dtype, device=device)


def policy_embedding(
    observation: str,
    dimension: int,
    *,
    torch_module: Any,
    dtype: Any = None,
    device: Any = None,
):
    """Encode structured policy packets while preserving reusable semantic factors.

    Each ``|`` field and ``=``/``,`` value is hashed independently and summed into
    a fixed-width vector. This intentionally shares coordinates for repeated
    relations such as ``deadline=urgent`` and ``attribute=quality`` rather than
    hashing an entire observation string as one opaque symbol.
    """
    if dimension < 2:
        raise ValueError("policy embeddings require at least two dimensions")

    tokens: list[str] = []
    for field in observation.replace("\n", "|").split("|"):
        field = field.strip()
        if not field:
            continue
        tokens.append(field)
        if "=" in field:
            key, value = (part.strip() for part in field.split("=", maxsplit=1))
            tokens.extend((key, value, f"{key}={value}"))
        if "," in field:
            tokens.extend(part.strip() for part in field.split(",") if part.strip())

    values = [0.0] * dimension
    for token in tokens:
        token_values = _hash_values(f"policy:{token}", dimension)
        for index, value in enumerate(token_values):
            values[index] += value / max(1, len(tokens))
    return _tensor(values, dimension, torch_module=torch_module, dtype=dtype, device=device)
