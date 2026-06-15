"""
model/layers/tick_loop.py

Iterative tick loop: attend → update neurons → recompute sync → check confidence.

The loop terminates when confidence ≥ threshold OR max_ticks is reached.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch

from .correlation import pearson_correlation
from .sync_attention import SyncAttention
from .confidence_head import ConfidenceHead


MAX_TICKS = 32
DEFAULT_CONFIDENCE_THRESHOLD = 0.9


@dataclass
class TickLoopLog:
    ticks_run: int
    max_ticks: int
    converged: bool
    confidence: float
    confidence_threshold: float


class TickLoop(torch.nn.Module):
    """Runs the iterative tick loop over a set of neuron embeddings.

    Parameters
    ----------
    attention : SyncAttention
    confidence_head : ConfidenceHead
    max_ticks : int
    confidence_threshold : float
    """

    def __init__(
        self,
        attention: SyncAttention,
        confidence_head: ConfidenceHead,
        max_ticks: int = MAX_TICKS,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
    ) -> None:
        super().__init__()
        self.attention = attention
        self.confidence_head = confidence_head
        self.max_ticks = max_ticks
        self.confidence_threshold = confidence_threshold

    def forward(
        self,
        embeddings: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, TickLoopLog]:
        """Run tick loop starting from initial embeddings.

        Parameters
        ----------
        embeddings : torch.Tensor
            Shape (N, embed_dim).

        Returns
        -------
        context : torch.Tensor
            Shape (N, value_dim) — final attended context after loop terminates.
        sync_matrix : torch.Tensor
            Shape (N, N) — final pairwise sync matrix.
        log : TickLoopLog
            Structured log of loop execution.
        """
        n = embeddings.shape[0]
        context = embeddings  # initial context = embeddings

        # Initial sync matrix
        sync = _compute_sync(context)

        confidence = torch.tensor(0.0)
        ticks_run = 0
        converged = False

        for tick in range(self.max_ticks):
            ticks_run = tick + 1

            # Attend: query from sync, K/V from current context
            context = self.attention(sync, context)

            # Recompute sync from updated context
            sync = _compute_sync(context)

            # Check confidence
            confidence = self.confidence_head(sync)
            if confidence.item() >= self.confidence_threshold:
                converged = True
                break

        log = TickLoopLog(
            ticks_run=ticks_run,
            max_ticks=self.max_ticks,
            converged=converged,
            confidence=float(confidence.item()),
            confidence_threshold=self.confidence_threshold,
        )
        return context, sync, log


def _compute_sync(context: torch.Tensor) -> torch.Tensor:
    """Build N×N Pearson correlation sync matrix from context vectors."""
    n = context.shape[0]
    sync = torch.zeros(n, n, dtype=context.dtype, device=context.device)
    for i in range(n):
        for j in range(n):
            sync[i, j] = pearson_correlation(context[i], context[j])
    return sync
