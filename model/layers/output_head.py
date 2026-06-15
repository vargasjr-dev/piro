"""
model/layers/output_head.py

2-layer MLP: flattened sync matrix → ReLU → linear → softmax → class probabilities.

Produces the final classification distribution after the tick loop converges.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class OutputHead(nn.Module):
    """Maps a flattened sync matrix to a probability distribution over classes.

    Parameters
    ----------
    n_neurons : int
        Number of neurons N. Input dim = N².
    hidden_dim : int
        Width of the hidden layer.
    n_classes : int
        Number of output classes.
    """

    def __init__(self, n_neurons: int, hidden_dim: int, n_classes: int) -> None:
        super().__init__()
        sync_flat = n_neurons * n_neurons
        self.fc1 = nn.Linear(sync_flat, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, n_classes)

    def forward(self, sync_matrix: torch.Tensor) -> torch.Tensor:
        """Compute class probabilities from sync matrix.

        Parameters
        ----------
        sync_matrix : torch.Tensor
            Shape (N, N).

        Returns
        -------
        torch.Tensor
            Shape (n_classes,) — probability distribution summing to 1.
        """
        x = F.relu(self.fc1(sync_matrix.flatten()))
        return F.softmax(self.fc2(x), dim=-1)

    def logits(self, sync_matrix: torch.Tensor) -> torch.Tensor:
        """Return raw logits (pre-softmax) for use with CrossEntropyLoss."""
        x = F.relu(self.fc1(sync_matrix.flatten()))
        return self.fc2(x)
