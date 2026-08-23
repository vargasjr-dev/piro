"""Borealis: a functional durable/adaptation self-updating language model.

Borealis is intentionally smaller than the deferred CTM experiment.  It follows
``docs/architecture/stateful-rl-first-model-v0.1.md`` directly:

* durable parameters embed tokens and predict the next token;
* a run-local adaptation output-bias state adapts from causal prediction error;
* each prediction is made with durable weights bound to the current adaptation state;
* adaptation updates run-local state during the invocation;
* consolidation runs at the end of every invocation and produces the next durable revision.

Borealis uses a reversible frontier-style BPE tokenizer at the architecture
boundary. The tokenizer identity is persisted with the model configuration so
training and serving share the same vocabulary and decode generated token IDs
back into text.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F

from architectures._common import ArchitectureModel, json_state
from architectures.borealis.tokenizer import BorealisTokenizer


@dataclass
class BorealisConfig:
    vocab_size: int | None = None
    tokenizer_name: str | None = "byte_bpe"
    tokenizer_merges: list[list[int]] | None = None
    target_prefix: str = "\nANSWER:"
    max_new_tokens: int = 32
    embed_dim: int = 32
    context_dim: int = 64
    adaptation_learning_rate: float = 0.1
    consolidation_rate: float = 0.25
    eos_token_id: int | None = None


class TiedOutputHead(nn.Module):
    """Project context into embedding space and reuse token embeddings as logits."""

    def __init__(self, embedding: nn.Embedding, context_dim: int) -> None:
        super().__init__()
        self.weight = embedding.weight
        self.projection = nn.Linear(context_dim, embedding.embedding_dim)
        self.bias = nn.Parameter(torch.zeros(embedding.num_embeddings))

    def forward(self, context: torch.Tensor) -> torch.Tensor:
        projected = self.projection(context)
        return F.linear(projected, self.weight, self.bias)


@dataclass
class BorealisAdaptationState:
    """Run-local mutable state used during a Borealis episode."""

    output_bias: torch.Tensor
    updates: int = 0
    loss_ema: float | None = None

    def clone(self) -> BorealisAdaptationState:
        return BorealisAdaptationState(
            output_bias=self.output_bias.detach().clone(),
            updates=self.updates,
            loss_ema=self.loss_ema,
        )


@dataclass
class BorealisRuntimeWeights:
    """Durable weights bound to one run-local adaptation state."""

    adaptation_state: BorealisAdaptationState


@dataclass
class BorealisGenerationState:
    """Context representation and adaptation state carried across generation steps."""

    context_state: torch.Tensor
    adaptation_state: BorealisAdaptationState


class Borealis(ArchitectureModel):
    """Small causal model with explicit adaptation and consolidation."""

    name = "Borealis"
    slug = "borealis"
    description = (
        "Text-first causal model with run-local adaptation overlay, durable weights, "
        "and explicit replay-safe consolidation."
    )
    module = "borealis"
    config_type = BorealisConfig
    training_batch_size = 16
    hyper_parameters = {**BorealisConfig().__dict__}

    def __init__(self, config: BorealisConfig | None = None, **kwargs: Any) -> None:
        super().__init__()
        cfg = config or BorealisConfig(**kwargs)
        tokenizer_name = cfg.tokenizer_name
        if tokenizer_name is None:
            raise ValueError("tokenizer_name is required for the language-model path")
        self.tokenizer = BorealisTokenizer(tokenizer_name, cfg.tokenizer_merges)
        vocab_size = self.tokenizer.vocab_size
        if cfg.vocab_size is not None and cfg.vocab_size != vocab_size:
            raise ValueError("vocab_size must match the selected tokenizer vocabulary")
        if cfg.max_new_tokens < 1:
            raise ValueError("max_new_tokens must be positive")
        if cfg.embed_dim <= 0 or cfg.context_dim <= 0:
            raise ValueError("embed_dim and context_dim must be positive")
        if cfg.adaptation_learning_rate < 0:
            raise ValueError("adaptation_learning_rate must be non-negative")
        if not 0 <= cfg.consolidation_rate <= 1:
            raise ValueError("consolidation_rate must be in [0, 1]")
        eos_token_id = cfg.eos_token_id
        if eos_token_id is None:
            eos_token_id = self.tokenizer.eos_token_id
        if eos_token_id is not None and not 0 <= eos_token_id < vocab_size:
            raise ValueError("eos_token_id must be within the tokenizer vocabulary")

        self.config = replace(
            cfg,
            vocab_size=vocab_size,
            eos_token_id=eos_token_id,
        )
        self.token_embedding = nn.Embedding(vocab_size, self.config.embed_dim)
        self.input_projection = nn.Linear(self.config.embed_dim, self.config.context_dim)
        self.recurrent = nn.GRUCell(self.config.context_dim, self.config.context_dim)
        self.output_norm = nn.LayerNorm(self.config.context_dim)
        self.output_head = TiedOutputHead(self.token_embedding, self.config.context_dim)

    @classmethod
    def config_for_training(cls, examples: list[Any]) -> dict[str, Any]:
        texts = [
            str(value)
            for example in examples
            for value in (
                *example.inputs,
                getattr(example, "continuation_prefix", "\nANSWER:"),
                example.target,
            )
        ]
        tokenizer = BorealisTokenizer.fit(texts, max_vocab_size=8192)
        return {
            "tokenizer_name": tokenizer.name,
            "tokenizer_merges": [list(pair) for pair in tokenizer.merges],
        }

    def _training_text(self, example: Any) -> str:
        prompt = "\n".join(str(value) for value in example.inputs)
        continuation_prefix = getattr(example, "continuation_prefix", self.config.target_prefix)
        return f"{prompt}{continuation_prefix}{example.target}"

    def training_example_diagnostics(self, example: Any) -> dict[str, Any]:
        text = self._training_text(example)
        token_count = len(self.tokenizer.encode_training_text(text))
        return {
            "inputCharCount": len(text),
            "tokenCount": token_count,
            "sequenceSteps": max(0, token_count - 1),
        }

    def _tokens(self, example: Any) -> torch.Tensor:
        values = self.tokenizer.encode_training_text(self._training_text(example))
        return torch.tensor(values, dtype=torch.long, device=self.token_embedding.weight.device)

    def _sequence_logits(self, tokens: torch.Tensor) -> torch.Tensor:
        """Return teacher-forced logits for every next-token target."""
        tokens = self._validate_tokens(tokens)
        context_state = self.initialize_context_state().to(device=tokens.device)
        runtime = self.bind_adaptation_state(self, self.initialize_adaptation_state())
        logits: list[torch.Tensor] = []
        for token in tokens[:-1]:
            next_logits, context_state = self.predict_next_token(token, context_state, runtime)
            logits.append(next_logits)
        return torch.stack(logits)

    def training_loss(self, example: Any) -> torch.Tensor:
        tokens = self._tokens(example)
        logits = self._sequence_logits(tokens)
        return F.cross_entropy(logits, tokens[1:])

    def invoke(self, input_packet: dict[str, Any], state: dict[str, Any] | None = None) -> dict[str, Any]:
        text = self._text_from_input(input_packet)
        prompt = self._encode(f"{text}{self.config.target_prefix}")
        adaptation_state = (
            self.load_adaptation_state(state)
            if state is not None
            else self.initialize_adaptation_state()
        )
        with torch.no_grad():
            generated, final_state = self.generate_with_state(
                prompt,
                self.config.max_new_tokens,
                adaptation_state,
                adapt=True,
            )
        generated_ids = [int(token_id) for token_id in generated.detach().cpu().tolist()]
        return {
            "text": self.tokenizer.decode_generated(generated_ids),
            "metadata": {
                "outputFormat": "text",
                "tokenizer": self.config.tokenizer_name,
                "tokenIds": generated_ids,
                "eosTokenId": self.config.eos_token_id,
                "stoppedAtEos": bool(
                    generated_ids and generated_ids[-1] == self.config.eos_token_id
                ),
            },
            "state": json_state(self.snapshot_adaptation_state(final_state.adaptation_state)),
        }

    @staticmethod
    def _text_from_input(input_packet: dict[str, Any]) -> str:
        parts = input_packet.get("parts")
        if not isinstance(parts, list) or not parts:
            raise ValueError("input must contain at least one PiroInput part")
        texts: list[str] = []
        for part in parts:
            if not isinstance(part, dict) or part.get("type") != "text":
                raise ValueError("input parts must be text parts")
            value = part.get("text")
            if not isinstance(value, str) or not value.strip():
                raise ValueError("input text parts must be non-empty strings")
            texts.append(value)
        return "\n".join(texts)

    def _encode(self, text: str) -> torch.Tensor:
        values = self.tokenizer.encode(text)
        if len(values) < 1:
            values.append(self.config.eos_token_id or 0)
        return torch.tensor(values, dtype=torch.long, device=self.token_embedding.weight.device)

    # ── Pseudocode contract ────────────────────────────────────────────────────

    def initialize_adaptation_state(self) -> BorealisAdaptationState:
        """Initialize run-local adaptation state from the durable model shape."""
        return BorealisAdaptationState(
            output_bias=torch.zeros(
                self._vocab_size(),
                device=self.output_head.weight.device,
                dtype=self.output_head.weight.dtype,
            )
        )

    def bind_adaptation_state(
        self,
        durable_weights: Any,
        adaptation_state: BorealisAdaptationState,
    ) -> BorealisRuntimeWeights:
        """Bind an adaptation state to the current durable model revision.

        ``durable_weights`` is intentionally an explicit boundary in the API;
        this implementation stores the durable substrate in the module itself.
        """
        del durable_weights
        self._validate_adaptation_state(adaptation_state)
        return BorealisRuntimeWeights(adaptation_state=adaptation_state)

    def embed(self, token: torch.Tensor) -> torch.Tensor:
        """Map one observed token id into the shared representation."""
        if token.ndim != 0:
            raise ValueError("embed expects one scalar token id")
        return self.input_projection(self.token_embedding(token.long()))

    def initialize_context_state(self) -> torch.Tensor:
        """Create the zero context representation for a new sequence."""
        return torch.zeros(
            self.config.context_dim,
            device=self.token_embedding.weight.device,
            dtype=self.token_embedding.weight.dtype,
        )

    def advance_context_state(
        self,
        observed_token: torch.Tensor,
        context_state: torch.Tensor,
    ) -> torch.Tensor:
        """Advance the context representation without producing output logits."""
        embedded = self.embed(observed_token)
        return self.recurrent(embedded.unsqueeze(0), context_state.unsqueeze(0)).squeeze(0)

    def predict_next_token(
        self,
        observed_token: torch.Tensor,
        context_state: torch.Tensor,
        runtime_weights: BorealisRuntimeWeights,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Predict the next token for the adaptation scan."""
        next_context_state = self.advance_context_state(observed_token, context_state)
        logits = self.predict_logits(next_context_state, runtime_weights)
        return logits, next_context_state

    def predict_logits(
        self,
        context_state: torch.Tensor,
        runtime_weights: BorealisRuntimeWeights,
    ) -> torch.Tensor:
        """Produce next-token logits used only by the adaptation scan."""
        durable_logits = self.output_head(self.output_norm(context_state))
        return durable_logits + runtime_weights.adaptation_state.output_bias

    def output_logits(
        self,
        context_state: torch.Tensor,
        runtime_weights: BorealisRuntimeWeights,
    ) -> torch.Tensor:
        """Produce the final response after the adaptation scan completes."""
        durable_logits = self.output_head(self.output_norm(context_state))
        return durable_logits + runtime_weights.adaptation_state.output_bias

    def adaptation_step(
        self,
        adaptation_state: BorealisAdaptationState,
        logits: torch.Tensor,
        target: torch.Tensor,
        loss: torch.Tensor,
    ) -> BorealisAdaptationState:
        """Apply the exact output-bias gradient of causal cross-entropy.

        The update is computed from detached probabilities so it mutates only
        run-local state.  The returned training loss still retains its graph for
        ordinary backpropagation into durable parameters.
        """
        next_state = adaptation_state.clone()
        if self.config.adaptation_learning_rate == 0:
            return next_state
        with torch.no_grad():
            gradient = torch.softmax(logits.detach(), dim=-1)
            gradient[target.long()] -= 1.0
            next_state.output_bias.sub_(self.config.adaptation_learning_rate * gradient)
            next_state.updates += 1
            value = float(loss.detach())
            next_state.loss_ema = (
                value if next_state.loss_ema is None else 0.9 * next_state.loss_ema + 0.1 * value
            )
        return next_state

    def consolidate_weights(self, adaptation_state: BorealisAdaptationState) -> BorealisAdaptationState:
        """Propose a durable output-bias update and clear consumed adaptation state."""
        self._validate_adaptation_state(adaptation_state)
        with torch.no_grad():
            self.output_head.bias.add_(self.config.consolidation_rate * adaptation_state.output_bias)
        next_state = adaptation_state.clone()
        next_state.output_bias.zero_()
        next_state.updates = 0
        next_state.loss_ema = None
        return next_state

    def save_weights(self) -> dict[str, torch.Tensor]:
        """Return the updated durable revision for the next invocation."""
        return {key: value.detach().clone() for key, value in self.state_dict().items()}

    def snapshot_adaptation_state(self, adaptation_state: BorealisAdaptationState) -> dict[str, Any]:
        """Serialize run-local state without coupling the model to storage."""
        self._validate_adaptation_state(adaptation_state)
        return {
            "output_bias": adaptation_state.output_bias.detach().clone(),
            "updates": adaptation_state.updates,
            "loss_ema": adaptation_state.loss_ema,
        }

    def load_adaptation_state(self, snapshot: dict[str, Any]) -> BorealisAdaptationState:
        """Restore a previously returned adaptation state."""
        output_bias = torch.as_tensor(
            snapshot["output_bias"],
            device=self.output_head.weight.device,
            dtype=self.output_head.weight.dtype,
        ).clone()
        loss_ema = float(snapshot["loss_ema"]) if snapshot.get("loss_ema") is not None else None
        state = BorealisAdaptationState(
            output_bias=output_bias,
            updates=int(snapshot.get("updates", 0)),
            loss_ema=loss_ema,
        )
        self._validate_adaptation_state(state)
        return state

    # ── Functional model execution ────────────────────────────────────────────

    def prefill(
        self,
        token_ids: torch.Tensor,
        adaptation_state: BorealisAdaptationState | None = None,
        *,
        adapt: bool = True,
    ) -> BorealisGenerationState:
        """Read a prompt and return the recurrent state for its next token.

        Known prompt transitions can supervise adaptation. The returned
        context state is the model's compressed representation of the complete
        prompt; it is carried forward instead of replaying the prompt at each
        generation step.
        """
        tokens = self._validate_prompt_tokens(token_ids)
        state = (adaptation_state or self.initialize_adaptation_state()).clone()
        context_state = self.initialize_context_state().to(device=tokens.device)
        runtime = self.bind_adaptation_state(self, state)

        for index in range(tokens.numel() - 1):
            logits, context_state = self.predict_next_token(tokens[index], context_state, runtime)
            target = tokens[index + 1]
            loss = F.cross_entropy(logits.unsqueeze(0), target.unsqueeze(0))
            if adapt:
                state = self.adaptation_step(state, logits, target, loss)
                runtime = self.bind_adaptation_state(self, state)

        context_state = self.advance_context_state(tokens[-1], context_state)
        return BorealisGenerationState(context_state=context_state, adaptation_state=state)

    def next_token_logits(self, generation_state: BorealisGenerationState) -> torch.Tensor:
        """Read next-token logits from a prefetched generation state."""
        self._validate_generation_state(generation_state)
        runtime = self.bind_adaptation_state(self, generation_state.adaptation_state)
        return self.output_logits(generation_state.context_state, runtime)

    def advance_generation(
        self,
        generation_state: BorealisGenerationState,
        token: torch.Tensor,
    ) -> BorealisGenerationState:
        """Consume one generated token and carry its representation forward."""
        self._validate_generation_state(generation_state)
        token = self._validate_single_token(token)
        context_state = self.advance_context_state(token, generation_state.context_state)
        return BorealisGenerationState(
            context_state=context_state,
            adaptation_state=generation_state.adaptation_state.clone(),
        )

    def generate_with_state(
        self,
        prompt_token_ids: torch.Tensor,
        max_new_tokens: int,
        adaptation_state: BorealisAdaptationState | None = None,
        *,
        adapt: bool = True,
        eos_token_id: int | None = None,
    ) -> tuple[torch.Tensor, BorealisGenerationState]:
        """Greedily generate tokens and return the post-invocation state."""
        if max_new_tokens < 0:
            raise ValueError("max_new_tokens must be non-negative")
        if eos_token_id is not None and not 0 <= eos_token_id < self._vocab_size():
            raise ValueError("eos_token_id must be within the tokenizer vocabulary")
        stop_token_id = self.config.eos_token_id if eos_token_id is None else eos_token_id

        prompt = self._validate_prompt_tokens(prompt_token_ids)
        state = self.prefill(prompt, adaptation_state, adapt=adapt)
        generated: list[torch.Tensor] = []
        for _ in range(max_new_tokens):
            logits = self.next_token_logits(state)
            token = torch.argmax(logits, dim=-1)
            generated.append(token)
            if stop_token_id is not None and int(token) == stop_token_id:
                break
            state = self.advance_generation(state, token)

        next_adaptation_state = self.consolidate_weights(state.adaptation_state)
        state = BorealisGenerationState(
            context_state=state.context_state.detach().clone(),
            adaptation_state=next_adaptation_state,
        )
        if not generated:
            return prompt.new_empty((0,), dtype=torch.long), state
        return torch.stack(generated).to(device=prompt.device), state

    def generate(
        self,
        prompt_token_ids: torch.Tensor,
        max_new_tokens: int,
        adaptation_state: BorealisAdaptationState | None = None,
        *,
        adapt: bool = True,
        eos_token_id: int | None = None,
    ) -> torch.Tensor:
        """Greedily generate a continuation while carrying context state forward."""
        generated, _ = self.generate_with_state(
            prompt_token_ids,
            max_new_tokens,
            adaptation_state,
            adapt=adapt,
            eos_token_id=eos_token_id,
        )
        return generated

    def run(
        self,
        token_ids: torch.Tensor,
        adaptation_state: BorealisAdaptationState | None = None,
        *,
        adapt: bool = True,
    ) -> torch.Tensor:
        """Adapt on the input context, then return its final output logits.

        Losses supervise adaptation and durable learning internally; the
        serving boundary exposes only the completed output.
        """
        tokens = self._validate_tokens(token_ids)
        state = self.prefill(tokens[:-1], adaptation_state, adapt=adapt)
        final_logits = self.next_token_logits(state)
        self.consolidate_weights(state.adaptation_state)
        return final_logits

    def causal_loss(self, token_ids: torch.Tensor) -> torch.Tensor:
        """Return differentiable teacher-forced loss over every next-token target."""
        tokens = self._validate_tokens(token_ids)
        logits = self._sequence_logits(tokens)
        return F.cross_entropy(logits, tokens[1:])

    def forward(self, token_ids: torch.Tensor) -> torch.Tensor:
        """Return the final next-token logits for Trainer-style callers."""
        return self.run(token_ids, adapt=False)

    def _vocab_size(self) -> int:
        vocab_size = self.config.vocab_size
        if vocab_size is None:
            raise RuntimeError("resolved Borealis configuration is missing vocab_size")
        return vocab_size

    def _validate_prompt_tokens(self, token_ids: torch.Tensor) -> torch.Tensor:
        if token_ids.ndim != 1 or token_ids.numel() < 1:
            raise ValueError("expected a one-dimensional prompt with at least one token")
        tokens = token_ids.to(device=self.token_embedding.weight.device, dtype=torch.long)
        if bool((tokens < 0).any()) or bool((tokens >= self._vocab_size()).any()):
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
        if bool(token < 0) or bool(token >= self._vocab_size()):
            raise ValueError("token id must be within the configured vocabulary")
        return token

    def _validate_generation_state(self, state: BorealisGenerationState) -> None:
        if tuple(state.context_state.shape) != (self.config.context_dim,):
            raise ValueError(f"context state must have shape {(self.config.context_dim,)}")
        self._validate_adaptation_state(state.adaptation_state)

    def _validate_adaptation_state(self, adaptation_state: BorealisAdaptationState) -> None:
        expected = (self.config.vocab_size,)
        if tuple(adaptation_state.output_bias.shape) != expected:
            raise ValueError(f"adaptation output bias must have shape {expected}")


BorealisConfig.__module__ = __name__
BorealisAdaptationState.__module__ = __name__
BorealisGenerationState.__module__ = __name__
BorealisRuntimeWeights.__module__ = __name__
