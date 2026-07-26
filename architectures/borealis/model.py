"""Borealis: a functional fast/slow self-updating language model.

Borealis is intentionally smaller than the deferred CTM experiment.  It follows
``docs/architecture/stateful-rl-first-model-v0.1.md`` directly:

* durable parameters embed tokens and predict the next token;
* a run-local fast output-bias state adapts from causal prediction error;
* each prediction is made with durable weights bound to the current fast state;
* fast adaptation updates run-local state during the invocation;
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

from architectures._common import ArchitectureModel


@dataclass
class BorealisConfig:
    vocab_size: int = 32
    embed_dim: int = 32
    hidden_dim: int = 64
    fast_learning_rate: float = 0.1
    consolidation_rate: float = 0.25


@dataclass
class BorealisFastState:
    """Run-local mutable state used during a Borealis episode."""

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
class BorealisGenerationState:
    """Recurrent representation and fast state carried across generation steps."""

    hidden: torch.Tensor
    fast_state: BorealisFastState


class Borealis(ArchitectureModel):
    """Small causal model with explicit fast adaptation and consolidation."""

    name = "Borealis"
    slug = "borealis"
    description = (
        "Text-first causal model with run-local fast weights, durable weights, "
        "and explicit replay-safe consolidation."
    )
    module = "borealis"
    hyper_parameters = {**BorealisConfig().__dict__}

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

    def initialize_hidden_state(self) -> torch.Tensor:
        """Create the zero recurrent representation for a new sequence."""
        return torch.zeros(
            self.config.hidden_dim,
            device=self.token_embedding.weight.device,
            dtype=self.token_embedding.weight.dtype,
        )

    def advance_hidden(
        self,
        observed_token: torch.Tensor,
        hidden: torch.Tensor,
    ) -> torch.Tensor:
        """Advance the recurrent representation without producing output logits."""
        embedded = self.embed(observed_token)
        return self.recurrent(embedded.unsqueeze(0), hidden.unsqueeze(0)).squeeze(0)

    def predict_next_token(
        self,
        observed_token: torch.Tensor,
        hidden: torch.Tensor,
        runtime_weights: BorealisRuntimeWeights,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Predict the next observed token for fast adaptation."""
        next_hidden = self.advance_hidden(observed_token, hidden)
        logits = self.predict_logits(next_hidden, runtime_weights)
        return logits, next_hidden

    def predict_logits(
        self,
        hidden: torch.Tensor,
        runtime_weights: BorealisRuntimeWeights,
    ) -> torch.Tensor:
        """Produce next-token logits used only by the adaptation scan."""
        durable_logits = self.output_head(self.output_norm(hidden))
        return durable_logits + runtime_weights.fast_state.output_bias

    def output_logits(
        self,
        hidden: torch.Tensor,
        runtime_weights: BorealisRuntimeWeights,
    ) -> torch.Tensor:
        """Produce the final response after the adaptation scan completes."""
        durable_logits = self.output_head(self.output_norm(hidden))
        return durable_logits + runtime_weights.fast_state.output_bias

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
                value if next_state.loss_ema is None else 0.9 * next_state.loss_ema + 0.1 * value
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
        loss_ema = float(snapshot["loss_ema"]) if snapshot.get("loss_ema") is not None else None
        state = BorealisFastState(
            output_bias=output_bias,
            updates=int(snapshot.get("updates", 0)),
            loss_ema=loss_ema,
        )
        self._validate_fast_state(state)
        return state

    # ── Functional model execution ────────────────────────────────────────────

    def prefill(
        self,
        token_ids: torch.Tensor,
        fast_state: BorealisFastState | None = None,
        *,
        adapt: bool = True,
    ) -> BorealisGenerationState:
        """Read a prompt and return the recurrent state for its next token.

        Known prompt transitions can supervise fast adaptation. The returned
        hidden state is the model's compressed representation of the complete
        prompt; it is carried forward instead of replaying the prompt at each
        generation step.
        """
        tokens = self._validate_prompt_tokens(token_ids)
        state = (fast_state or self.initialize_fast_state()).clone()
        hidden = self.initialize_hidden_state().to(device=tokens.device)
        runtime = self.bind_fast_state(self, state)

        for index in range(tokens.numel() - 1):
            logits, hidden = self.predict_next_token(tokens[index], hidden, runtime)
            target = tokens[index + 1]
            loss = F.cross_entropy(logits.unsqueeze(0), target.unsqueeze(0))
            if adapt:
                state = self.fast_adaptation(state, logits, target, loss)
                runtime = self.bind_fast_state(self, state)

        hidden = self.advance_hidden(tokens[-1], hidden)
        return BorealisGenerationState(hidden=hidden, fast_state=state)

    def next_token_logits(self, generation_state: BorealisGenerationState) -> torch.Tensor:
        """Read next-token logits from a prefetched generation state."""
        self._validate_generation_state(generation_state)
        runtime = self.bind_fast_state(self, generation_state.fast_state)
        return self.output_logits(generation_state.hidden, runtime)

    def advance_generation(
        self,
        generation_state: BorealisGenerationState,
        token: torch.Tensor,
    ) -> BorealisGenerationState:
        """Consume one generated token and carry its representation forward."""
        self._validate_generation_state(generation_state)
        token = self._validate_single_token(token)
        hidden = self.advance_hidden(token, generation_state.hidden)
        return BorealisGenerationState(
            hidden=hidden,
            fast_state=generation_state.fast_state.clone(),
        )

    def generate_with_state(
        self,
        prompt_token_ids: torch.Tensor,
        max_new_tokens: int,
        fast_state: BorealisFastState | None = None,
        *,
        adapt: bool = True,
        eos_token_id: int | None = None,
    ) -> tuple[torch.Tensor, BorealisGenerationState]:
        """Greedily generate tokens and return the post-invocation state."""
        if max_new_tokens < 0:
            raise ValueError("max_new_tokens must be non-negative")
        if eos_token_id is not None and not 0 <= eos_token_id < self.config.vocab_size:
            raise ValueError("eos_token_id must be within the configured vocabulary")

        prompt = self._validate_prompt_tokens(prompt_token_ids)
        state = self.prefill(prompt, fast_state, adapt=adapt)
        generated: list[torch.Tensor] = []
        for _ in range(max_new_tokens):
            logits = self.next_token_logits(state)
            token = torch.argmax(logits, dim=-1)
            generated.append(token)
            state = self.advance_generation(state, token)
            if eos_token_id is not None and int(token) == eos_token_id:
                break

        next_fast_state = self.consolidate_weights(state.fast_state)
        state = BorealisGenerationState(
            hidden=state.hidden.detach().clone(),
            fast_state=next_fast_state,
        )
        if not generated:
            return prompt.new_empty((0,), dtype=torch.long), state
        return torch.stack(generated).to(device=prompt.device), state

    def generate(
        self,
        prompt_token_ids: torch.Tensor,
        max_new_tokens: int,
        fast_state: BorealisFastState | None = None,
        *,
        adapt: bool = True,
        eos_token_id: int | None = None,
    ) -> torch.Tensor:
        """Greedily generate a continuation while carrying hidden state forward."""
        generated, _ = self.generate_with_state(
            prompt_token_ids,
            max_new_tokens,
            fast_state,
            adapt=adapt,
            eos_token_id=eos_token_id,
        )
        return generated

    def run(
        self,
        token_ids: torch.Tensor,
        fast_state: BorealisFastState | None = None,
        *,
        adapt: bool = True,
    ) -> torch.Tensor:
        """Adapt on the input context, then return its final output logits.

        Losses supervise fast adaptation and durable learning internally; the
        serving boundary exposes only the completed output.
        """
        tokens = self._validate_tokens(token_ids)
        state = self.prefill(tokens[:-1], fast_state, adapt=adapt)
        final_logits = self.next_token_logits(state)
        self.consolidate_weights(state.fast_state)
        return final_logits

    def causal_loss(self, token_ids: torch.Tensor) -> torch.Tensor:
        """Return differentiable causal loss without exposing training telemetry."""
        tokens = self._validate_tokens(token_ids)
        logits = self.run(tokens, adapt=False)
        return F.cross_entropy(logits.unsqueeze(0), tokens[-1].unsqueeze(0))

    def forward(self, token_ids: torch.Tensor) -> torch.Tensor:
        """Return the final next-token logits for Trainer-style callers."""
        return self.run(token_ids, adapt=False)

    def _validate_prompt_tokens(self, token_ids: torch.Tensor) -> torch.Tensor:
        if token_ids.ndim != 1 or token_ids.numel() < 1:
            raise ValueError("expected a one-dimensional prompt with at least one token")
        tokens = token_ids.to(device=self.token_embedding.weight.device, dtype=torch.long)
        if bool((tokens < 0).any()) or bool((tokens >= self.config.vocab_size).any()):
            raise ValueError("token ids must be within the configured vocabulary")
        return tokens

    def _validate_tokens(self, token_ids: torch.Tensor) -> torch.Tensor:
        if token_ids.ndim != 1 or token_ids.numel() < 2:
            raise ValueError("expected a one-dimensional token sequence with at least two tokens")
        return self._validate_prompt_tokens(token_ids)

    def _validate_single_token(self, token: torch.Tensor) -> torch.Tensor:
        if token.ndim != 0:
            raise ValueError("expected one scalar token")
        token = token.to(device=self.token_embedding.weight.device, dtype=torch.long)
        if bool(token < 0) or bool(token >= self.config.vocab_size):
            raise ValueError("token id must be within the configured vocabulary")
        return token

    def _validate_generation_state(self, state: BorealisGenerationState) -> None:
        if tuple(state.hidden.shape) != (self.config.hidden_dim,):
            raise ValueError(f"hidden state must have shape {(self.config.hidden_dim,)}")
        self._validate_fast_state(state.fast_state)

    def _validate_fast_state(self, fast_state: BorealisFastState) -> None:
        expected = (self.config.vocab_size,)
        if tuple(fast_state.output_bias.shape) != expected:
            raise ValueError(f"fast output bias must have shape {expected}")


BorealisConfig.__module__ = __name__
BorealisFastState.__module__ = __name__
BorealisGenerationState.__module__ = __name__
BorealisRuntimeWeights.__module__ = __name__
