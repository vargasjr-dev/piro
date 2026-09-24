"""Corona: a fast-weight language model with a meta-learned inner loop.

Corona replaces Borealis's GRU backbone with TTT-style blocks. Each block
carries a fast-weight matrix as its hidden state and updates it during the
forward pass with gradient steps on a self-supervised reconstruction loss:

* the inner loop runs on every token, including tokens the model generated
  itself, because reconstruction needs no labels;
* the update rule is trained end-to-end: the outer next-token loss backprops
  through the unrolled inner updates into the projections, the fast-weight
  initialization, and a learned inner-loop learning rate;
* training uses chunked mini-batch updates in the dual form so the inner loop
  compiles to matmuls instead of a token-at-a-time Python loop.

Like Borealis, Corona is a causal language model over a persisted byte-fallback
BPE tokenizer, with factorized input/output embeddings tied at the head.
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
class CoronaConfig:
    vocab_size: int | None = None
    tokenizer_name: str | None = "byte_bpe"
    tokenizer_merges: list[list[int]] | None = None
    # Source-owned continuation framing is persisted during training. Natural
    # language continuations use an empty prefix.
    target_prefix: str = ""
    max_new_tokens: int = 32
    model_dim: int = 320
    inner_dim: int = 320
    embed_table_dim: int = 64
    num_blocks: int = 2
    chunk_size: int = 16
    inner_learning_rate_init: float = 0.1
    eos_token_id: int | None = None


@dataclass
class CoronaGenerationState:
    """Run-local state carried across generation steps.

    ``block_states`` holds one fast-weight matrix per block. These matrices are
    the model's memory: they keep adapting on every observed token, including
    tokens Corona generated itself.

    ``stream_input`` is the post-shift residual-stream input of the last
    consumed token (block readouts read from it); ``last_embed`` is that
    token's raw embedding, kept so the next token shift can be built.
    """

    stream_input: torch.Tensor
    last_embed: torch.Tensor
    block_states: tuple[torch.Tensor, ...]
    updates: int = 0
    loss_ema: float | None = None

    def clone(self) -> CoronaGenerationState:
        return CoronaGenerationState(
            stream_input=self.stream_input.detach().clone(),
            last_embed=self.last_embed.detach().clone(),
            block_states=tuple(matrix.detach().clone() for matrix in self.block_states),
            updates=self.updates,
            loss_ema=self.loss_ema,
        )


class CoronaBlock(nn.Module):
    """One TTT-style fast-weight block.

    The hidden state is the matrix ``W``. Within a training chunk the per-token
    updates are folded into a single differentiable dual-form computation;
    across chunks the updated matrix is carried forward sequentially.
    """

    def __init__(self, model_dim: int, inner_dim: int, chunk_size: int, inner_lr_init: float) -> None:
        super().__init__()
        self.pre_norm = nn.LayerNorm(model_dim)
        self.theta_k = nn.Linear(model_dim, inner_dim, bias=False)
        self.theta_v = nn.Linear(model_dim, inner_dim, bias=False)
        self.theta_q = nn.Linear(model_dim, inner_dim, bias=False)
        self.post_norm = nn.LayerNorm(inner_dim)
        self.out_proj = nn.Linear(inner_dim, model_dim, bias=False)
        self.w_init = nn.Parameter(torch.randn(inner_dim, inner_dim) * 0.02)
        self.inner_learning_rate = nn.Parameter(torch.tensor(float(inner_lr_init)))
        self.chunk_size = chunk_size

    def _keys_values_queries(self, stream: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        normalized = self.pre_norm(stream)
        keys = F.normalize(self.theta_k(normalized), dim=-1)
        values = F.normalize(self.theta_v(normalized), dim=-1)
        queries = self.theta_q(normalized)
        return keys, values, queries

    def scan(self, stream: torch.Tensor) -> torch.Tensor:
        """Differentiable chunked mini-batch TTT over a full sequence.

        ``stream`` has shape (T, model_dim); returns (T, model_dim).

        Keys and values are L2-normalized per token so the inner update is a
        contraction: the per-token update magnitude is bounded by
        ``2 * inner_lr * ||error||`` with ``||k|| = 1``, keeping the LMS-style
        recursion inside its stability bound (``2 * inner_lr < 2``) no matter
        how the projections scale with width.
        """
        keys, values, queries = self._keys_values_queries(stream)
        outputs = torch.zeros_like(queries)
        matrix = self.w_init
        learning_rate = self.inner_learning_rate
        for start in range(0, stream.shape[0], self.chunk_size):
            stop = min(start + self.chunk_size, stream.shape[0])
            chunk_keys = keys[start:stop].T
            chunk_values = values[start:stop].T
            chunk_queries = queries[start:stop].T
            # (K^T Q)[j, tau] pairs key position j with query position tau, so
            # the mask must keep keys at or before the query (j <= tau): the
            # UPPER triangle in this orientation. tril here was transposed and
            # fed each readout the reconstruction error of FUTURE tokens in
            # the chunk, letting training loss collapse by copying the answer
            # (2026-09 corona-30k: loss 0.019, generation loops).
            causal = torch.triu(
                torch.ones(stop - start, stop - start, device=stream.device, dtype=stream.dtype)
            )
            reconstruction_error = matrix @ chunk_keys - chunk_values
            outputs[start:stop] = (
                matrix @ chunk_queries - 2 * learning_rate * (reconstruction_error @ (causal * (chunk_keys.T @ chunk_queries)))
            ).T
            matrix = matrix - 2 * learning_rate * (reconstruction_error @ chunk_keys.T)
        return stream + self.out_proj(self.post_norm(outputs))

    def step(self, stream: torch.Tensor, matrix: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Primal token-at-a-time update used while generating.

        Mirrors the chunked training recursion: same L2-normalized keys and
        values, same update rule.
        """
        keys, values, queries = self._keys_values_queries(stream)
        gradient = 2 * (matrix @ keys - values)
        matrix = matrix - self.inner_learning_rate * torch.outer(gradient, keys)
        output = matrix @ queries
        return stream + self.out_proj(self.post_norm(output)), matrix


class Corona(ArchitectureModel):
    """Small causal language model with meta-learned fast-weight memory."""

    name = "Corona"
    slug = "corona"
    description = (
        "Causal language model with TTT-style fast-weight blocks: the hidden "
        "state is a matrix updated by self-supervised gradient steps, trained "
        "end-to-end through the unrolled inner loop."
    )
    module = "corona"
    config_type = CoronaConfig
    training_batch_size = 8
    training_vocab_size = 2048
    training_embed_table_dim = 64
    training_model_dim = 320
    training_inner_dim = 320
    training_num_blocks = 2
    # The outer loss backprops through the full unrolled inner loop (one
    # gradient step per token), which multiplies meta-gradients across the
    # whole sequence — clip so one hot step cannot poison the weights.
    gradient_clip_max_norm = 1.0
    hyper_parameters = {**CoronaConfig().__dict__}

    def __init__(self, config: CoronaConfig | None = None, **kwargs: Any) -> None:
        super().__init__()
        cfg = config or CoronaConfig(**kwargs)
        tokenizer_name = cfg.tokenizer_name
        if tokenizer_name is None:
            raise ValueError("tokenizer_name is required for the language-model path")
        self.tokenizer = BorealisTokenizer(tokenizer_name, cfg.tokenizer_merges)
        vocab_size = self.tokenizer.vocab_size
        if cfg.vocab_size is not None and cfg.vocab_size != vocab_size:
            raise ValueError("vocab_size must match the selected tokenizer vocabulary")
        if cfg.max_new_tokens < 1:
            raise ValueError("max_new_tokens must be positive")
        if cfg.model_dim <= 0 or cfg.inner_dim <= 0 or cfg.embed_table_dim <= 0:
            raise ValueError("model_dim, inner_dim, and embed_table_dim must be positive")
        if cfg.num_blocks < 1:
            raise ValueError("num_blocks must be positive")
        if cfg.chunk_size < 1:
            raise ValueError("chunk_size must be positive")

        eos_token_id = cfg.eos_token_id
        if eos_token_id is None:
            eos_token_id = self.tokenizer.eos_token_id
        if eos_token_id is not None and not 0 <= eos_token_id < vocab_size:
            raise ValueError("eos_token_id must be within the tokenizer vocabulary")

        self.config = replace(cfg, vocab_size=vocab_size, eos_token_id=eos_token_id)
        self.token_table = nn.Embedding(vocab_size, self.config.embed_table_dim)
        self.input_up = nn.Linear(self.config.embed_table_dim, self.config.model_dim)
        self.blocks = nn.ModuleList(
            CoronaBlock(
                self.config.model_dim,
                self.config.inner_dim,
                self.config.chunk_size,
                self.config.inner_learning_rate_init,
            )
            for _ in range(self.config.num_blocks)
        )
        self.final_norm = nn.LayerNorm(self.config.model_dim)
        self.output_down = nn.Linear(self.config.model_dim, self.config.embed_table_dim)
        self.head_bias = nn.Parameter(torch.zeros(vocab_size))

    @classmethod
    def config_for_training(cls, examples: list[Any]) -> dict[str, Any]:
        texts = [
            str(value)
            for example in examples
            for value in (
                *example.inputs,
                getattr(example, "continuation_prefix", ""),
                example.target,
            )
        ]
        tokenizer = BorealisTokenizer.fit(texts, max_vocab_size=cls.training_vocab_size)
        prefixes = {str(getattr(example, "continuation_prefix", "")) for example in examples}
        if len(prefixes) > 1:
            raise ValueError("Corona training examples must use one continuation prefix")
        return {
            "vocab_size": tokenizer.vocab_size,
            "model_dim": cls.training_model_dim,
            "inner_dim": cls.training_inner_dim,
            "embed_table_dim": cls.training_embed_table_dim,
            "num_blocks": cls.training_num_blocks,
            "tokenizer_name": tokenizer.name,
            "tokenizer_merges": [list(pair) for pair in tokenizer.merges],
            "target_prefix": next(iter(prefixes), ""),
        }

    # ── Sequence encoding ─────────────────────────────────────────────────────

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
        return torch.tensor(values, dtype=torch.long, device=self.token_table.weight.device)

    def _embed_tokens(self, tokens: torch.Tensor) -> torch.Tensor:
        """Embed token ids and apply the causal token shift."""
        embedded = self.input_up(self.token_table(tokens))
        half = embedded.shape[-1] // 2
        shifted = torch.cat(
            [
                embedded[:, :half],
                torch.roll(embedded[:, half:], shifts=1, dims=0),
            ],
            dim=-1,
        )
        shifted[0, half:] = 0.0
        return shifted

    def _logits(self, stream: torch.Tensor) -> torch.Tensor:
        normalized = self.final_norm(stream)
        return F.linear(self.output_down(normalized), self.token_table.weight, self.head_bias)

    # ── Training: outer loop through the unrolled inner loop ─────────────────

    def training_loss(self, example: Any) -> torch.Tensor:
        tokens = self._tokens(example)
        if tokens.numel() < 2:
            raise ValueError("training examples must contain at least two tokens")
        stream = self._embed_tokens(tokens)
        for block in self.blocks:
            stream = block.scan(stream)
        logits = self._logits(stream[:-1])
        return F.cross_entropy(logits, tokens[1:])

    # ── Generation: primal per-token updates, self-supervised ─────────────────

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

    def initialize_generation_state(self) -> CoronaGenerationState:
        return CoronaGenerationState(
            stream_input=torch.zeros(
                self.config.model_dim, device=self.token_table.weight.device
            ),
            last_embed=torch.zeros(
                self.config.model_dim, device=self.token_table.weight.device
            ),
            block_states=tuple(block.w_init.detach().clone() for block in self.blocks),
        )

    def _consume_token(
        self,
        token: torch.Tensor,
        state: CoronaGenerationState,
        *,
        adapt: bool,
    ) -> tuple[CoronaGenerationState, torch.Tensor | None]:
        """Advance the model by one observed token; returns next state and inner loss."""
        next_state = state.clone()
        raw_embed = self.input_up(self.token_table(token)).squeeze(0)
        half = raw_embed.shape[-1] // 2
        stream = torch.cat([raw_embed[:half], state.last_embed[half:]])
        next_state.last_embed = raw_embed.detach()
        loss: torch.Tensor | None = None
        for index, block in enumerate(self.blocks):
            matrix = next_state.block_states[index]
            keys, values, queries = block._keys_values_queries(stream)
            if adapt:
                reconstruction = matrix @ keys
                inner_loss = (reconstruction - values).pow(2).sum()
                loss = inner_loss if loss is None else loss + inner_loss
                gradient = 2 * (reconstruction - values)
                matrix = matrix - block.inner_learning_rate * torch.outer(gradient, keys)
                next_state.block_states = (
                    next_state.block_states[:index] + (matrix,) + next_state.block_states[index + 1 :]
                )
            stream = stream + block.out_proj(block.post_norm(matrix @ queries))
        next_state.stream_input = stream.detach()
        next_state.updates += 1
        if loss is not None:
            value = float(loss.detach())
            next_state.loss_ema = (
                value if next_state.loss_ema is None else 0.9 * next_state.loss_ema + 0.1 * value
            )
        return next_state, loss

    def prefill(
        self,
        token_ids: torch.Tensor,
        state: CoronaGenerationState | None = None,
        *,
        adapt: bool = True,
    ) -> CoronaGenerationState:
        tokens = self._validate_tokens(token_ids)
        current = (state or self.initialize_generation_state()).clone()
        for token in tokens:
            current, _ = self._consume_token(token, current, adapt=adapt)
        return current

    def next_token_logits(self, state: CoronaGenerationState) -> torch.Tensor:
        self._validate_generation_state(state)
        stream = state.stream_input
        for index, block in enumerate(self.blocks):
            matrix = state.block_states[index]
            queries = block.theta_q(block.pre_norm(stream))
            stream = stream + block.out_proj(block.post_norm(matrix @ queries))
        return self._logits(stream.unsqueeze(0)).squeeze(0)

    def generate_with_state(
        self,
        prompt_token_ids: torch.Tensor,
        max_new_tokens: int,
        state: CoronaGenerationState | None = None,
        *,
        adapt: bool = True,
        eos_token_id: int | None = None,
    ) -> tuple[torch.Tensor, CoronaGenerationState]:
        """Greedily generate tokens while the inner loop keeps adapting."""
        if max_new_tokens < 0:
            raise ValueError("max_new_tokens must be non-negative")
        if eos_token_id is not None and not 0 <= eos_token_id < self._vocab_size():
            raise ValueError("eos_token_id must be within the tokenizer vocabulary")
        stop_token_id = self.config.eos_token_id if eos_token_id is None else eos_token_id

        current = self.prefill(prompt_token_ids, state, adapt=adapt)
        generated: list[torch.Tensor] = []
        for _ in range(max_new_tokens):
            logits = self.next_token_logits(current)
            token = torch.argmax(logits, dim=-1)
            generated.append(token)
            if stop_token_id is not None and int(token) == stop_token_id:
                break
            current, _ = self._consume_token(token, current, adapt=adapt)
        if not generated:
            return prompt_token_ids.new_empty((0,), dtype=torch.long), current
        return torch.stack(generated).to(device=prompt_token_ids.device), current

    def generate(
        self,
        prompt_token_ids: torch.Tensor,
        max_new_tokens: int,
        state: CoronaGenerationState | None = None,
        *,
        adapt: bool = True,
        eos_token_id: int | None = None,
    ) -> torch.Tensor:
        generated, _ = self.generate_with_state(
            prompt_token_ids,
            max_new_tokens,
            state,
            adapt=adapt,
            eos_token_id=eos_token_id,
        )
        return generated

    def invoke(self, input_packet: dict[str, Any], state: dict[str, Any] | None = None) -> dict[str, Any]:
        text = self._text_from_input(input_packet)
        prompt = self._encode(f"{text}{self.config.target_prefix}")
        generation_state = (
            self.load_generation_state(state)
            if state is not None
            else self.initialize_generation_state()
        )
        with torch.no_grad():
            generated, final_state = self.generate_with_state(
                prompt,
                self.config.max_new_tokens,
                generation_state,
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
                "innerUpdates": final_state.updates,
            },
            "state": json_state(self.snapshot_generation_state(final_state)),
        }

    def _encode(self, text: str) -> torch.Tensor:
        values = self.tokenizer.encode(text)
        if len(values) < 1:
            values.append(self.config.eos_token_id or 0)
        return torch.tensor(values, dtype=torch.long, device=self.token_table.weight.device)

    # ── State serialization ───────────────────────────────────────────────────

    def snapshot_generation_state(self, state: CoronaGenerationState) -> dict[str, Any]:
        self._validate_generation_state(state)
        return {
            "streamInput": state.stream_input.detach().clone(),
            "lastEmbed": state.last_embed.detach().clone(),
            "blockStates": [matrix.detach().clone() for matrix in state.block_states],
            "updates": state.updates,
            "lossEma": state.loss_ema,
        }

    def load_generation_state(self, snapshot: dict[str, Any]) -> CoronaGenerationState:
        device = self.token_table.weight.device

        def tensor(value: Any) -> torch.Tensor:
            return torch.as_tensor(value, device=device, dtype=torch.float32).clone()

        loss_ema = float(snapshot["lossEma"]) if snapshot.get("lossEma") is not None else None
        state = CoronaGenerationState(
            stream_input=tensor(snapshot["streamInput"]),
            last_embed=tensor(snapshot["lastEmbed"]),
            block_states=tuple(tensor(matrix) for matrix in snapshot["blockStates"]),
            updates=int(snapshot.get("updates", 0)),
            loss_ema=loss_ema,
        )
        self._validate_generation_state(state)
        return state

    def _vocab_size(self) -> int:
        vocab_size = self.config.vocab_size
        if vocab_size is None:
            raise RuntimeError("resolved Corona configuration is missing vocab_size")
        return vocab_size

    # ── Validation ────────────────────────────────────────────────────────────

    def _validate_prompt_tokens(self, token_ids: torch.Tensor) -> torch.Tensor:
        if token_ids.ndim != 1 or token_ids.numel() < 1:
            raise ValueError("expected a one-dimensional prompt with at least one token")
        tokens = token_ids.to(device=self.token_table.weight.device, dtype=torch.long)
        if bool((tokens < 0).any()) or bool((tokens >= self._vocab_size()).any()):
            raise ValueError("token ids must be within the configured vocabulary")
        return tokens

    def _validate_tokens(self, token_ids: torch.Tensor) -> torch.Tensor:
        return self._validate_prompt_tokens(token_ids)

    def _validate_generation_state(self, state: CoronaGenerationState) -> None:
        if tuple(state.stream_input.shape) != (self.config.model_dim,):
            raise ValueError(f"stream input must have shape {(self.config.model_dim,)}")
        if len(state.block_states) != len(self.blocks):
            raise ValueError("generation state must carry one fast-weight matrix per block")
        for matrix in state.block_states:
            if tuple(matrix.shape) != (self.config.inner_dim, self.config.inner_dim):
                raise ValueError(
                    f"block fast-weight state must have shape {(self.config.inner_dim, self.config.inner_dim)}"
                )


CoronaConfig.__module__ = __name__
CoronaGenerationState.__module__ = __name__
