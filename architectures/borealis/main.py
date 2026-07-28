"""Borealis architecture entrypoint for model loading and invocation."""

from __future__ import annotations

from dataclasses import fields
from typing import Any

import torch

from architectures.borealis.model import Borealis, BorealisConfig

MODEL_CLASS = "Borealis"


def load_model(config: dict[str, Any], state_dict: dict[str, torch.Tensor]) -> Borealis:
    """Construct a Borealis model from persisted configuration."""
    config_fields = {field.name for field in fields(BorealisConfig)}
    model_config = BorealisConfig(
        **{key: value for key, value in config.items() if key in config_fields}
    )
    model = Borealis(model_config)
    model.load_state_dict(state_dict)
    model.eval()
    return model


def invoke(
    model: Borealis,
    input_packet: dict[str, Any],
    state: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run Borealis on one PiroInput packet and expose its token prediction."""
    del config
    text = _text_from_input(input_packet)
    token_ids = _encode(text, model.config.vocab_size)
    fast_state = model.load_fast_state(state) if state is not None else model.initialize_fast_state()
    with torch.no_grad():
        logits = model.run(token_ids, fast_state, adapt=True)
    # ``run`` consolidates the adapted fast state into durable weights and
    # returns logits only; the next invocation starts with a fresh fast state.
    return {
        "text": str(int(logits.argmax().item())),
        "state": _json_state(model.snapshot_fast_state(model.initialize_fast_state())),
    }


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


def _encode(text: str, vocab_size: int) -> torch.Tensor:
    token_ids = [byte % vocab_size for byte in text.encode("utf-8")]
    if len(token_ids) < 2:
        token_ids.append(0)
    return torch.tensor(token_ids, dtype=torch.long)


def _json_state(value: Any) -> Any:
    if hasattr(value, "detach"):
        return value.detach().cpu().tolist()
    if isinstance(value, dict):
        return {key: _json_state(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_state(item) for item in value]
    return value
