"""
model/layers/sync_attention.py

Cross-attention module: query from flattened sync matrix, key/value from embeddings.

The sync matrix encodes pairwise neuron correlations; attending over the embedding
sequence with sync-derived queries lets the model route information based on how
neurons are currently synchronized.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class SyncAttention(nn.Module):
    """Cross-attention: Q from sync matrix, K/V from embeddings.

    Parameters
    ----------
    n_neurons : int
        Number of neurons N. Sync matrix is N×N (flat dim = N²).
    embed_dim : int
        Dimensionality of each neuron embedding.
    query_dim : int
        Projected query/key dimension.
    value_dim : int
        Projected value dimension (output dim per position).
    """

    def __init__(
        self,
        n_neurons: int,
        embed_dim: int,
        query_dim: int,
        value_dim: int,
    ) -> None:
        super().__init__()
        sync_flat = n_neurons * n_neurons
        self.scale = query_dim ** -0.5

        # No bias — matches TS implementation
        self.W_q = nn.Linear(sync_flat, query_dim, bias=False)
        self.W_k = nn.Linear(embed_dim, query_dim, bias=False)
        self.W_v = nn.Linear(embed_dim, value_dim, bias=False)

    def forward(
        self,
        sync_matrix: torch.Tensor,
        embeddings: torch.Tensor,
    ) -> torch.Tensor:
        """Attend over embeddings using sync-derived query.

        Parameters
        ----------
        sync_matrix : torch.Tensor
            Shape (N, N) — pairwise neuron correlation matrix.
        embeddings : torch.Tensor
            Shape (N, embed_dim) — one vector per neuron.

        Returns
        -------
        torch.Tensor
            Shape (N, value_dim) — attended context, one vector per neuron.
        """
        sync_flat = sync_matrix.flatten()  # (N²,)

        query = self.W_q(sync_flat)           # (query_dim,)
        keys = self.W_k(embeddings)           # (N, query_dim)
        values = self.W_v(embeddings)         # (N, value_dim)

        # Scaled dot-product attention: query vs each key → weights over N neurons
        scores = (keys @ query) * self.scale  # (N,)
        weights = F.softmax(scores, dim=0)    # (N,)

        # Weighted sum of values → (value_dim,), tiled to (N, value_dim)
        context = (weights.unsqueeze(-1) * values).sum(dim=0)  # (value_dim,)
        return context.unsqueeze(0).expand(embeddings.shape[0], -1)  # (N, value_dim)

    def compute_weights(
        self,
        sync_matrix: torch.Tensor,
        embeddings: torch.Tensor,
    ) -> torch.Tensor:
        """Return attention weights (N,) without computing attended values.

        Useful for interpretability / logging.
        """
        sync_flat = sync_matrix.flatten()
        query = self.W_q(sync_flat)
        keys = self.W_k(embeddings)
        scores = (keys @ query) * self.scale
        return F.softmax(scores, dim=0)
