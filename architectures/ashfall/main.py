"""Ashfall architecture entrypoint for model loading and invocation."""

from __future__ import annotations

import re
from dataclasses import fields
from typing import Any

import torch

from architectures._common.encoding import memory_embedding, policy_embedding
from architectures.ashfall.ctm import ContinuousThoughtModel, CTMConfig

MODEL_TEMPLATE = "ashfall"


def load_model(config: dict[str, Any], state_dict: dict[str, torch.Tensor]) -> ContinuousThoughtModel:
    """Construct an Ashfall model from persisted training configuration."""
    config_fields = {field.name for field in fields(CTMConfig)}
    model_config = CTMConfig(
        **{key: value for key, value in config.items() if key in config_fields}
    )
    model = ContinuousThoughtModel(model_config)
    model.load_state_dict(state_dict)
    model.eval()
    return model


def invoke(
    model: ContinuousThoughtModel,
    input_packet: dict[str, Any],
    state: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Invoke Ashfall on one PiroInput packet and return text plus next state."""
    text = _text_from_input(input_packet)
    if _looks_like_sorting_prompt(text):
        return {"text": _sort(model, text), "state": None}

    next_text, next_state = _associative_step(
        model,
        text,
        state,
        policy_mode=(config or {}).get("dataSource") == "owner-policy-worlds",
    )
    return {"text": next_text, "state": _json_state(next_state)}


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


def _looks_like_sorting_prompt(text: str) -> bool:
    return "=" not in text and re.search(r"\[[^\]]+\]", text) is not None


def _sort(model: ContinuousThoughtModel, prompt: str) -> str:
    match = re.search(r"\[([^\]]+)\]", prompt)
    if match is None:
        return ""
    try:
        numbers = [int(value.strip()) for value in match.group(1).split(",")]
    except ValueError as exc:
        raise ValueError("sorting input must contain comma-separated integers") from exc

    chunk_size = model.config.n_neurons
    return " ".join(str(value) for value in _selection_sort(model, numbers, chunk_size))


def _selection_sort(model: ContinuousThoughtModel, numbers: list[int], chunk_size: int) -> list[int]:
    remaining = list(numbers)
    result: list[int] = []
    while remaining:
        minimum = _find_min(model, remaining, chunk_size)
        result.append(minimum)
        remaining.remove(minimum)
    return result


def _find_min(model: ContinuousThoughtModel, numbers: list[int], chunk_size: int) -> int:
    if len(numbers) <= chunk_size:
        return _argmin_chunk(model, numbers, chunk_size)
    candidates = [
        _argmin_chunk(model, numbers[index : index + chunk_size], chunk_size)
        for index in range(0, len(numbers), chunk_size)
    ]
    return _find_min(model, candidates, chunk_size)


def _argmin_chunk(model: ContinuousThoughtModel, values: list[int], chunk_size: int) -> int:
    embed_dim = model.config.embed_dim
    padded = values + [embed_dim - 1] * (chunk_size - len(values))
    embeddings = torch.zeros(len(padded), embed_dim)
    for index, value in enumerate(padded):
        embeddings[index, min(value, embed_dim - 1)] = 1.0
    with torch.no_grad():
        output = model(embeddings)
    logits = output.logits if hasattr(output, "logits") else output
    return values[int(logits[: len(values)].argmax().item())]


def _associative_step(
    model: ContinuousThoughtModel,
    text: str,
    state: dict[str, Any] | None,
    *,
    policy_mode: bool,
) -> tuple[str, dict[str, Any]]:
    if state is None:
        model.reset()
    else:
        model.load_state(_load_json_state(model, state))

    parameter = next(model.parameters())
    answer = "ACK"
    if policy_mode:
        is_query = "CHOICE|" not in text
        if is_query:
            output = model(
                policy_embedding(
                    text,
                    model.config.embed_dim,
                    torch_module=torch,
                    dtype=parameter.dtype,
                    device=parameter.device,
                )
            )
            answer = str(int(output.logits.argmax().item()))
        else:
            for observation in text.splitlines():
                if observation.strip():
                    model(
                        policy_embedding(
                            observation.strip(),
                            model.config.embed_dim,
                            torch_module=torch,
                            dtype=parameter.dtype,
                            device=parameter.device,
                        )
                    )
    else:
        for observation in text.splitlines():
            observation = observation.strip()
            if not observation:
                continue
            is_query = "=" not in observation and not observation.startswith("token_")
            output = model(
                memory_embedding(
                    f"QUERY:{observation}" if is_query else observation,
                    model.config.embed_dim,
                    torch_module=torch,
                    dtype=parameter.dtype,
                    device=parameter.device,
                )
            )
            if is_query:
                answer = f"value_{int(output.logits.argmax().item()):03d}"

    return answer, model.snapshot_state()


def _json_state(value: Any) -> Any:
    if hasattr(value, "detach"):
        return value.detach().cpu().tolist()
    if isinstance(value, dict):
        return {key: _json_state(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_state(item) for item in value]
    return value


def _load_json_state(model: ContinuousThoughtModel, payload: dict[str, Any]) -> dict[str, Any]:
    parameter = next(model.parameters())
    dtype = parameter.dtype
    device = parameter.device

    def tensor(value: Any, *, tensor_dtype: torch.dtype = dtype) -> torch.Tensor:
        return torch.tensor(value, dtype=tensor_dtype, device=device)

    state: dict[str, Any] = {
        "previous_activations": (
            tensor(payload["previous_activations"])
            if payload.get("previous_activations") is not None
            else None
        ),
        "history_entries": [tensor(entry) for entry in payload.get("history_entries", [])],
    }
    if "plastic_weights" in payload:
        state["plastic_weights"] = tensor(payload["plastic_weights"])
        state["plastic_ticks"] = int(payload.get("plastic_ticks", 0))
    if "burst_counter" in payload:
        state["burst_counter"] = tensor(payload["burst_counter"], tensor_dtype=torch.long)
        state["refractory_counter"] = tensor(
            payload.get("refractory_counter", []), tensor_dtype=torch.long
        )
    if "phases" in payload:
        state["phases"] = tensor(payload["phases"])
    return state
