"""Borealis: a functional fast/slow self-updating language model.

Borealis is intentionally smaller than the deferred CTM experiment.  It follows
``docs/architecture/stateful-rl-first-model-v0.1.md`` directly:

* durable parameters embed tokens and predict the next token;
* a run-local fast output-bias state adapts from causal prediction error;
* each prediction is made with durable weights bound to the current fast state;
* the updated fast state is returned as a value;
* consolidation runs at the end of every invocation and produces the next durable revision.

The model is token-id based for the first experiment.  Tokenization belongs at the
experiment boundary; keeping it out of the core makes the causal state behavior
measurable and lets synthetic tasks use tiny vocabularies.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F

from piro import PiroModel
from piro.schema import ArchitectureGraph, GraphEdge, GraphNode

@dataclass
class BorealisConfig:
    vocab_size: int = 32
    embed_dim: int = 32
    hidden_dim: int = 64
    fast_learning_rate: float = 0.1
    consolidation_rate: float = 0.25


@dataclass
class BorealisFastState:
    """Run-local mutable state returned by every Borealis episode."""

    output_bias: torch.Tensor
    updates: int = 0
    loss_ema: float | None = None

    def clone(self) -> BorealisFastState:
        return BorealisFastState(
            output_bias=self.output_bias.detach().clone(),
            updates=self.updates,
            loss_ema=self.loss_ema,
        )


@dataclass
class BorealisRuntimeWeights:
    """Durable weights bound to one run-local fast state."""

    fast_state: BorealisFastState


@dataclass
class BorealisOutput:
    """Result of one causal episode, including the next fast state."""

    logits: torch.Tensor
    logits_sequence: torch.Tensor
    probabilities: torch.Tensor
    loss: torch.Tensor
    predictions: torch.Tensor
    fast_state: BorealisFastState


class Borealis(PiroModel):
    """Small causal model with explicit fast adaptation and consolidation."""

    name = "Borealis"
    slug = "borealis"
    description = (
        "Text-first causal model with run-local fast weights, durable weights, "
        "and explicit replay-safe consolidation."
    )
    module = "borealis"
    hyper_parameters = {**BorealisConfig().__dict__}

    @classmethod
    def serialize_graph(cls) -> ArchitectureGraph | None:
        hp = cls.hyper_parameters
        return ArchitectureGraph(
            nodes=[
                GraphNode(
                    id="observation",
                    type="io",
                    label="Observation",
                    detail=f"token ids from vocabulary {hp['vocab_size']}",
                ),
                GraphNode(
                    id="embed",
                    type="linear",
                    label="Embed",
                    detail=f"{hp['vocab_size']} → {hp['embed_dim']}",
                ),
                GraphNode(
                    id="predict",
                    type="ffn",
                    label="Predict Next Token",
                    detail=f"GRU cell → {hp['vocab_size']} logits",
                ),
                GraphNode(
                    id="adapt",
                    type="sync",
                    label="Fast Adaptation",
                    detail="causal loss updates run-local output bias",
                ),
                GraphNode(
                    id="bind",
                    type="residual",
                    label="Bind Fast State",
                    detail="durable weights + active fast state",
                ),
                GraphNode(
                    id="policy",
                    type="confidence",
                    label="Persistence Policy",
                    detail="retain or consolidate",
                ),
                GraphNode(
                    id="output",
                    type="io",
                    label="Output Head",
                    detail="next-token logits and probabilities",
                ),
            ],
            edges=[
                GraphEdge(**{"from": "observation", "to": "embed"}),
                GraphEdge(**{"from": "embed", "to": "predict"}),
                GraphEdge(**{"from": "predict", "to": "adapt"}),
                GraphEdge(**{"from": "adapt", "to": "bind"}),
                GraphEdge(**{"from": "bind", "to": "predict"}),
                GraphEdge(**{"from": "predict", "to": "output"}),
                GraphEdge(**{"from": "adapt", "to": "policy"}),
                GraphEdge(**{"from": "policy", "to": "output"}),
            ],
        )

    def __init__(self, config: BorealisConfig | None = None, **kwargs: Any) -> None:
        super().__init__()
        cfg = config or BorealisConfig(**kwargs)
        if cfg.vocab_size < 2:
            raise ValueError("vocab_size must be at least 2")
        if cfg.embed_dim <= 0 or cfg.hidden_dim <= 0:
            raise ValueError("embed_dim and hidden_dim must be positive")
        if cfg.fast_learning_rate < 0:
            raise ValueError("fast_learning_rate must be non-negative")
        if not 0 <= cfg.consolidation_rate <= 1:
            raise ValueError("consolidation_rate must be in [0, 1]")

        self.config = cfg
        self.token_embedding = nn.Embedding(cfg.vocab_size, cfg.embed_dim)
        self.input_projection = nn.Linear(cfg.embed_dim, cfg.hidden_dim)
        self.recurrent = nn.GRUCell(cfg.hidden_dim, cfg.hidden_dim)
        self.output_norm = nn.LayerNorm(cfg.hidden_dim)
        self.output_head = nn.Linear(cfg.hidden_dim, cfg.vocab_size)

    # ── Pseudocode contract ────────────────────────────────────────────────────

    def initialize_fast_state(self) -> BorealisFastState:
        """Initialize run-local fast state from the durable model shape."""
        return BorealisFastState(
            output_bias=torch.zeros(
                self.config.vocab_size,
                device=self.output_head.weight.device,
                dtype=self.output_head.weight.dtype,
            )
        )

    def bind_fast_state(
        self,
        durable_weights: Any,
        fast_state: BorealisFastState,
    ) -> BorealisRuntimeWeights:
        """Bind a fast state to the current durable model revision.

        ``durable_weights`` is intentionally an explicit boundary in the API;
        this implementation stores the durable substrate in the module itself.
        """
        del durable_weights
        self._validate_fast_state(fast_state)
        return BorealisRuntimeWeights(fast_state=fast_state)

    def embed(self, token: torch.Tensor) -> torch.Tensor:
        """Map one observed token id into the shared representation."""
        if token.ndim != 0:
            raise ValueError("embed expects one scalar token id")
        return self.input_projection(self.token_embedding(token.long()))

    def predict_next_token(
        self,
        observed_token: torch.Tensor,
        hidden: torch.Tensor,
        runtime_weights: BorealisRuntimeWeights,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Predict the next token for one observed token/chunk."""
        embedded = self.embed(observed_token)
        next_hidden = self.recurrent(embedded.unsqueeze(0), hidden.unsqueeze(0)).squeeze(0)
        durable_logits = self.output_head(self.output_norm(next_hidden))
        logits = durable_logits + runtime_weights.fast_state.output_bias
        return logits, next_hidden

    def fast_adaptation(
        self,
        fast_state: BorealisFastState,
        logits: torch.Tensor,
        target: torch.Tensor,
        loss: torch.Tensor,
    ) -> BorealisFastState:
        """Apply the exact output-bias gradient of causal cross-entropy.

        The update is computed from detached probabilities so it mutates only
        run-local state.  The returned training loss still retains its graph for
        ordinary backpropagation into durable parameters.
        """
        next_state = fast_state.clone()
        if self.config.fast_learning_rate == 0:
            return next_state
        with torch.no_grad():
            gradient = torch.softmax(logits.detach(), dim=-1)
            gradient[target.long()] -= 1.0
            next_state.output_bias.sub_(self.config.fast_learning_rate * gradient)
            next_state.updates += 1
            value = float(loss.detach())
            next_state.loss_ema = (
                value
                if next_state.loss_ema is None
                else 0.9 * next_state.loss_ema + 0.1 * value
            )
        return next_state

    def consolidate_weights(self, fast_state: BorealisFastState) -> BorealisFastState:
        """Propose a durable output-bias update and clear consumed fast state."""
        self._validate_fast_state(fast_state)
        with torch.no_grad():
            self.output_head.bias.add_(self.config.consolidation_rate * fast_state.output_bias)
        next_state = fast_state.clone()
        next_state.output_bias.zero_()
        next_state.updates = 0
        next_state.loss_ema = None
        return next_state

    def save_weights(self) -> dict[str, torch.Tensor]:
        """Return the updated durable revision for the next invocation."""
        return {key: value.detach().clone() for key, value in self.state_dict().items()}

    def snapshot_fast_state(self, fast_state: BorealisFastState) -> dict[str, Any]:
        """Serialize run-local state without coupling the model to storage."""
        self._validate_fast_state(fast_state)
        return {
            "output_bias": fast_state.output_bias.detach().clone(),
            "updates": fast_state.updates,
            "loss_ema": fast_state.loss_ema,
        }

    def load_fast_state(self, snapshot: dict[str, Any]) -> BorealisFastState:
        """Restore a previously returned fast state."""
        output_bias = torch.as_tensor(
            snapshot["output_bias"],
            device=self.output_head.weight.device,
        ).clone()
        loss_ema = (
            float(snapshot["loss_ema"])
            if snapshot.get("loss_ema") is not None
            else None
        )
        state = BorealisFastState(
            output_bias=output_bias,
            updates=int(snapshot.get("updates", 0)),
            loss_ema=loss_ema,
        )
        self._validate_fast_state(state)
        return state

    # ── Functional model execution ────────────────────────────────────────────

    def run(
        self,
        token_ids: torch.Tensor,
        fast_state: BorealisFastState | None = None,
        *,
        adapt: bool = True,
    ) -> BorealisOutput:
        """Run a causal episode and return output plus updated fast state.

        ``token_ids`` is a one-dimensional sequence. Every token except the
        final one is observed and used to predict the following causal target.
        Durable consolidation runs at the end of every invocation; callers can
        persist the resulting durable revision with :meth:`save_weights`.
        """
        tokens = self._validate_tokens(token_ids)
        state = (fast_state or self.initialize_fast_state()).clone()
        runtime = self.bind_fast_state(self, state)
        hidden = torch.zeros(
            self.config.hidden_dim,
            device=tokens.device,
            dtype=self.token_embedding.weight.dtype,
        )
        logits_per_step: list[torch.Tensor] = []
        losses: list[torch.Tensor] = []
        predictions: list[torch.Tensor] = []

        for index in range(tokens.numel() - 1):
            logits, hidden = self.predict_next_token(tokens[index], hidden, runtime)
            target = tokens[index + 1]
            loss = F.cross_entropy(logits.unsqueeze(0), target.unsqueeze(0))
            logits_per_step.append(logits)
            losses.append(loss)
            predictions.append(logits.argmax())
            if adapt:
                state = self.fast_adaptation(state, logits, target, loss)
                runtime = self.bind_fast_state(self, state)

        stacked_logits = torch.stack(logits_per_step)
        mean_loss = torch.stack(losses).mean()
        state = self.consolidate_weights(state)

        return BorealisOutput(
            logits=stacked_logits[-1],
            logits_sequence=stacked_logits,
            probabilities=torch.softmax(stacked_logits[-1], dim=-1),
            loss=mean_loss,
            predictions=torch.stack(predictions),
            fast_state=state,
        )

    def causal_loss(self, token_ids: torch.Tensor) -> torch.Tensor:
        """Return differentiable causal loss without mutating fast state."""
        return self.run(token_ids, adapt=False).loss

    def forward(self, token_ids: torch.Tensor) -> torch.Tensor:
        """Return the final next-token logits for Trainer-style callers."""
        return self.run(token_ids, adapt=False).logits

    def _validate_tokens(self, token_ids: torch.Tensor) -> torch.Tensor:
        if token_ids.ndim != 1 or token_ids.numel() < 2:
            raise ValueError("expected a one-dimensional token sequence with at least two tokens")
        tokens = token_ids.to(device=self.token_embedding.weight.device, dtype=torch.long)
        if bool((tokens < 0).any()) or bool((tokens >= self.config.vocab_size).any()):
            raise ValueError("token ids must be within the configured vocabulary")
        return tokens

    def _validate_fast_state(self, fast_state: BorealisFastState) -> None:
        expected = (self.config.vocab_size,)
        if tuple(fast_state.output_bias.shape) != expected:
            raise ValueError(f"fast output bias must have shape {expected}")


BorealisConfig.__module__ = __name__
BorealisFastState.__module__ = __name__
BorealisRuntimeWeights.__module__ = __name__
BorealisOutput.__module__ = __name__
