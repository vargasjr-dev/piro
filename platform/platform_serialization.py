"""Helpers for safely serializing arbitrary tensor-shaped values to JSON."""

from __future__ import annotations

from typing import Any


def round_nested_numbers(value: Any, digits: int = 6) -> Any:
    """Round every numeric leaf in a nested tensor/list representation.

    ``Tensor.tolist()`` can return a scalar, a vector, or arbitrarily nested
    lists depending on the parameter shape. Recursing over the result avoids
    assuming model weights are only one- or two-dimensional.
    """

    if isinstance(value, list):
        return [round_nested_numbers(item, digits) for item in value]
    if isinstance(value, tuple):
        return [round_nested_numbers(item, digits) for item in value]
    return round(float(value), digits)
