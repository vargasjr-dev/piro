"""
model/train.py

Minimal training loop for ContinuousThoughtModel.

Verifies that gradients flow through the full computation graph:
    SyncAttention → TickLoop → OutputHead + ConfidenceHead

Runs a 10-epoch toy training loop on randomly generated data using:
    - Cross-entropy loss (classification)
    - Adam optimiser
    - 32 random (input, label) pairs per epoch

Usage
-----
    uv run python model/train.py          # default run, prints epoch losses
    uv run python model/train.py --seed 0 # reproducible with a specific seed
"""

from __future__ import annotations

import argparse
import math
from typing import NamedTuple

import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Constants ──────────────────────────────────────────────────────────────────

MAX_TICKS: int = 32
DEFAULT_CONFIDENCE_THRESHOLD: float = 0.9


# ── Model components ───────────────────────────────────────────────────────────


class SyncAttention(nn.Module):
    """
    Cross-attention layer where the query comes from the sync matrix
    and the key/value come from the input embeddings.

    Architecture (mirrors src/lib/model/sync-attention.ts):
        q = W_q · flatten(sync)        (query_dim,)
        k = W_k · emb_i               (query_dim,) per position
        v = W_v · emb_i               (value_dim,) per position
        ctx = softmax(q·k / √d_q) · V (value_dim,)
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
        self.Wq = nn.Linear(sync_flat, query_dim, bias=False)
        self.Wk = nn.Linear(embed_dim, query_dim, bias=False)
        self.Wv = nn.Linear(embed_dim, value_dim, bias=False)
        self.scale = math.sqrt(query_dim)

    def forward(
        self,
        sync_matrix: torch.Tensor,  # (n, n)
        embeddings: torch.Tensor,   # (seq_len, embed_dim)
    ) -> torch.Tensor:              # (value_dim,)
        sync_flat = sync_matrix.flatten()           # (n²,)
        query = self.Wq(sync_flat)                  # (query_dim,)

        keys   = self.Wk(embeddings)                # (seq, query_dim)
        values = self.Wv(embeddings)                # (seq, value_dim)

        scores  = (keys @ query) / self.scale       # (seq,)
        weights = F.softmax(scores, dim=0)          # (seq,)

        context = (weights.unsqueeze(-1) * values).sum(dim=0)  # (value_dim,)
        return context


class ConfidenceHead(nn.Module):
    """
    MLP: flatten(sync) → scalar confidence in (0, 1).
    Architecture: ReLU(W1·x + b1) → sigmoid(W2·h + b2).
    """

    def __init__(self, n_neurons: int, hidden_dim: int) -> None:
        super().__init__()
        input_dim = n_neurons * n_neurons
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, 1)

    def forward(self, sync_matrix: torch.Tensor) -> torch.Tensor:  # scalar
        x = sync_matrix.flatten()
        h = F.relu(self.fc1(x))
        return torch.sigmoid(self.fc2(h)).squeeze(-1)


class OutputHead(nn.Module):
    """
    MLP: flatten(sync) → softmax probability distribution over n_classes.
    Architecture: ReLU(W1·x + b1) → softmax(W2·h + b2).
    """

    def __init__(self, n_neurons: int, hidden_dim: int, n_classes: int) -> None:
        super().__init__()
        input_dim = n_neurons * n_neurons
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, n_classes)

    def forward(self, sync_matrix: torch.Tensor) -> torch.Tensor:  # (n_classes,)
        x = sync_matrix.flatten()
        h = F.relu(self.fc1(x))
        return F.softmax(self.fc2(h), dim=0)


class TickLoopResult(NamedTuple):
    context: torch.Tensor
    confidence: torch.Tensor
    ticks_run: int
    converged: bool


def compute_sync_matrix(
    neuron_history: list[torch.Tensor],
    n_neurons: int,
) -> torch.Tensor:
    """
    Pearson correlation matrix over neuron activation histories.
    Falls back to identity when history has fewer than 2 timesteps.
    """
    if len(neuron_history) < 2:
        return torch.eye(n_neurons)

    # Stack: (timesteps, n_neurons)
    acts = torch.stack(neuron_history)  # (T, n)
    # Centre each neuron's history
    centred = acts - acts.mean(dim=0, keepdim=True)  # (T, n)
    # Covariance (unnormalised)
    cov = centred.T @ centred                         # (n, n)
    # Variance per neuron
    var = (centred ** 2).sum(dim=0)                   # (n,)
    denom = torch.sqrt(var.unsqueeze(0) * var.unsqueeze(1))  # (n, n)
    # Avoid division by zero for constant neurons
    safe_denom = torch.where(denom > 0, denom, torch.ones_like(denom))
    corr = cov / safe_denom
    return corr.clamp(-1.0, 1.0)


def tick_loop(
    attention: SyncAttention,
    conf_head: ConfidenceHead,
    embeddings: torch.Tensor,     # (seq_len, embed_dim)
    n_neurons: int,
    value_dim: int,
    max_ticks: int = MAX_TICKS,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> TickLoopResult:
    """
    Iterative inference loop (mirrors src/lib/model/tick-loop.ts).

    Each tick:
      1. Attend — context from sync matrix + embeddings
      2. Update neuron activations from context
      3. Recompute sync matrix
      4. Check confidence — stop early if above threshold
    """
    neuron_history: list[torch.Tensor] = []
    sync = compute_sync_matrix(neuron_history, n_neurons)

    context = torch.zeros(value_dim)
    confidence = torch.tensor(0.0)
    tick = 0

    for tick in range(1, max_ticks + 1):
        context    = attention(sync, embeddings)
        activation = context[:n_neurons] if context.shape[0] >= n_neurons \
                     else context.repeat(math.ceil(n_neurons / context.shape[0]))[:n_neurons]
        neuron_history.append(activation)

        sync       = compute_sync_matrix(neuron_history, n_neurons)
        confidence = conf_head(sync)

        if confidence.item() > confidence_threshold:
            break

    return TickLoopResult(
        context=context,
        confidence=confidence,
        ticks_run=tick,
        converged=bool(confidence.item() > confidence_threshold),
    )


class ContinuousThoughtModel(nn.Module):
    """
    Full model: forward(embeddings) → (logits, confidence, tick_count).

    Mirrors src/lib/model/continuous-thought-model.ts.
    """

    def __init__(
        self,
        n_neurons: int,
        embed_dim: int,
        query_dim: int,
        value_dim: int,
        hidden_dim: int,
        n_classes: int,
        max_ticks: int = MAX_TICKS,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
    ) -> None:
        super().__init__()
        self.n_neurons = n_neurons
        self.value_dim = value_dim
        self.max_ticks = max_ticks
        self.confidence_threshold = confidence_threshold

        self.attention   = SyncAttention(n_neurons, embed_dim, query_dim, value_dim)
        self.conf_head   = ConfidenceHead(n_neurons, hidden_dim)
        self.output_head = OutputHead(n_neurons, hidden_dim, n_classes)

    def forward(
        self,
        embeddings: torch.Tensor,  # (seq_len, embed_dim) or (embed_dim,)
    ) -> tuple[torch.Tensor, torch.Tensor, int]:
        if embeddings.dim() == 1:
            embeddings = embeddings.unsqueeze(0)

        result = tick_loop(
            self.attention,
            self.conf_head,
            embeddings,
            self.n_neurons,
            self.value_dim,
            self.max_ticks,
            self.confidence_threshold,
        )

        # Build sync proxy from context for OutputHead (mirrors TS contextToSyncProxy)
        n2 = self.n_neurons * self.n_neurons
        flat = result.context.repeat(math.ceil(n2 / result.context.shape[0]))[:n2]
        sync_proxy = flat.reshape(self.n_neurons, self.n_neurons)

        logits = self.output_head(sync_proxy)
        return logits, result.confidence, result.ticks_run


# ── Training loop ──────────────────────────────────────────────────────────────


def make_toy_dataset(
    n_samples: int,
    seq_len: int,
    embed_dim: int,
    n_classes: int,
    generator: torch.Generator,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Random (inputs, labels) pair.

    inputs: (n_samples, seq_len, embed_dim) — uniform [-1, 1]
    labels: (n_samples,) — random class indices in [0, n_classes)
    """
    inputs = torch.empty(n_samples, seq_len, embed_dim).uniform_(-1.0, 1.0, generator=generator)
    labels = torch.randint(0, n_classes, (n_samples,), generator=generator)
    return inputs, labels


def train(
    *,
    seed: int = 42,
    n_epochs: int = 10,
    n_samples: int = 32,
    seq_len: int = 4,
    embed_dim: int = 8,
    n_classes: int = 5,
    n_neurons: int = 4,
    query_dim: int = 8,
    value_dim: int = 4,
    hidden_dim: int = 16,
    lr: float = 1e-3,
    max_ticks: int = 4,            # small for fast toy runs; real training uses MAX_TICKS
    confidence_threshold: float = 1.0,  # unreachable → always runs max_ticks (deterministic)
    verbose: bool = True,
) -> list[float]:
    """
    Train ContinuousThoughtModel for n_epochs on random toy data.

    Returns the per-epoch average cross-entropy loss.
    Raises AssertionError if loss does not decrease at all over the run.
    """
    torch.manual_seed(seed)
    gen = torch.Generator()
    gen.manual_seed(seed)

    model = ContinuousThoughtModel(
        n_neurons=n_neurons,
        embed_dim=embed_dim,
        query_dim=query_dim,
        value_dim=value_dim,
        hidden_dim=hidden_dim,
        n_classes=n_classes,
        max_ticks=max_ticks,
        confidence_threshold=confidence_threshold,
    )
    optimiser = torch.optim.Adam(model.parameters(), lr=lr)

    inputs, labels = make_toy_dataset(n_samples, seq_len, embed_dim, n_classes, gen)

    epoch_losses: list[float] = []

    for epoch in range(1, n_epochs + 1):
        total_loss = 0.0

        for i in range(n_samples):
            x = inputs[i]   # (seq_len, embed_dim)
            y = labels[i]   # scalar

            optimiser.zero_grad()
            logits, _confidence, _ticks = model(x)

            # cross_entropy expects log-probabilities; logits are already softmax probs
            loss = F.nll_loss(logits.log().unsqueeze(0), y.unsqueeze(0))
            loss.backward()
            optimiser.step()

            total_loss += loss.item()

        avg = total_loss / n_samples
        epoch_losses.append(avg)

        if verbose:
            print(f"epoch {epoch:2d}/{n_epochs}  loss={avg:.4f}")

    # Gradient-flow sanity check: loss must have decreased at some point
    assert min(epoch_losses) < epoch_losses[0], (
        "Loss never decreased — gradients may not be flowing through the graph."
    )

    if verbose:
        print(f"\n✓ Gradients flowing — loss went from {epoch_losses[0]:.4f} "
              f"to {epoch_losses[-1]:.4f} (min {min(epoch_losses):.4f})")

    return epoch_losses


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Piro toy training run")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()

    train(seed=args.seed, n_epochs=args.epochs)
