"""
model/layers/confidence_head.py

2-layer MLP: flattened sync matrix → ReLU → sigmoid → scalar in (0, 1).

Outputs the model's confidence that the tick loop has converged.
When confidence ≥ threshold the loop terminates early.
"""

from __future__ import annotations

import torch
import torch.nn as nn


class ConfidenceHead(nn.Module):
    """Maps a flattened sync matrix to a convergence confidence scalar.

    Parameters
    ----------
    n_neurons : int
        Number of neurons N. Input dim = N².
    hidden_dim : int
        Width of the hidden layer.
    """

    def __init__(self, n_neurons: int, hidden_dim: int) -> None:
        super().__init__()
        sync_flat = n_neurons * n_neurons
        self.net = nn.Sequential(
            nn.Linear(sync_flat, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
            nn.Sigmoid(),
        )

    def forward(self, sync_matrix: torch.Tensor) -> torch.Tensor:
        """Compute confidence from sync matrix.

        Parameters
        ----------
        sync_matrix : torch.Tensor
            Shape (N, N).

        Returns
        -------
        torch.Tensor
            Scalar tensor in (0, 1).
        """
        return self.net(sync_matrix.flatten()).squeeze(-1)
