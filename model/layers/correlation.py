"""
model/layers/correlation.py

Pearson correlation between two 1-D tensors.

Used to compute the N×N sync matrix: sync[i, j] = pearson(neuron_i, neuron_j),
where each neuron_i is its context vector slice.
"""

from __future__ import annotations

import torch


def pearson_correlation(a: torch.Tensor, b: torch.Tensor, eps: float = 1e-8) -> torch.Tensor:
    """Pearson correlation coefficient between two 1-D tensors.

    Parameters
    ----------
    a, b : torch.Tensor
        1-D tensors of the same length (≥ 2 elements).
    eps : float
        Small constant added to the denominator to avoid division by zero.

    Returns
    -------
    torch.Tensor
        Scalar in [-1, 1].

    Raises
    ------
    ValueError
        If inputs have different lengths or fewer than 2 elements.
    """
    if a.shape != b.shape:
        raise ValueError(f"Shape mismatch: {a.shape} vs {b.shape}")
    if a.ndim != 1 or a.numel() < 2:
        raise ValueError("Inputs must be 1-D tensors with at least 2 elements.")

    a_centered = a - a.mean()
    b_centered = b - b.mean()
    numerator = (a_centered * b_centered).sum()
    denominator = a_centered.norm() * b_centered.norm() + eps
    return (numerator / denominator).clamp(-1.0, 1.0)
