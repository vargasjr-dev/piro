"""Shared contracts and helpers for source-owned training data."""

from __future__ import annotations

import importlib
import json
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class Example:
    """One source-decoded example consumed by an architecture runtime."""

    inputs: tuple[Any, ...]
    target: Any
    metadata: dict[str, Any] = field(default_factory=dict)


class SourceTrainingAdapter(Protocol):
    """Source behavior needed by an architecture-owned training runtime."""

    def load(
        self,
        *,
        r2_client: Any,
        bucket: str,
        prefix: str,
        split: str,
        limit: int,
    ) -> list[Example]: ...


def source_module(source_path: str) -> Any:
    """Load the packaged source entrypoint from its canonical path suffix."""
    normalized = source_path.strip().strip("/")
    marker = "/sources/"
    normalized_path = f"/{normalized}"
    if marker in normalized_path:
        normalized = normalized_path.split(marker, maxsplit=1)[1]
        normalized = f"sources/{normalized}"
    if normalized.endswith(".py"):
        normalized = normalized[:-3]
    if normalized.rsplit("/", 1)[-1] != "main":
        normalized = f"{normalized}/main"
    return importlib.import_module(normalized.replace("/", "."))


def load_source_examples(
    *,
    source_path: str,
    r2_client: Any,
    bucket: str,
    prefix: str,
    split: str,
    limit: int,
) -> list[Example]:
    """Delegate decoding to the selected source entrypoint."""
    module = source_module(source_path)
    loader = getattr(module, "load_training_data", None)
    if loader is None:
        raise ValueError(f"source entrypoint {source_path!r} does not expose load_training_data")
    return loader(
        r2_client=r2_client,
        bucket=bucket,
        prefix=prefix,
        split=split,
        limit=limit,
    )


def read_jsonl(*, r2_client: Any, bucket: str, prefix: str) -> list[dict[str, Any]]:
    """Read generated source records without imposing a dataset schema."""
    response = r2_client.get_object(Bucket=bucket, Key=f"{prefix.rstrip('/')}/train.jsonl")
    return [
        json.loads(line)
        for line in response["Body"].read().decode("utf-8").splitlines()
        if line.strip()
    ]


def split_records(
    records: list[dict[str, Any]],
    *,
    split: str,
    limit: int,
) -> list[dict[str, Any]]:
    """Use explicit source marks when present, otherwise a deterministic holdout."""
    requested = "train" if split == "train" else "eval"
    selected = [
        record
        for record in records
        if record.get("metadata", {}).get("split") == requested
    ]
    if not selected:
        split_at = max(1, int(len(records) * 0.8))
        selected = records[:split_at] if split == "train" else records[split_at:] or records[:1]
    return selected[:limit]


def input_texts(record: dict[str, Any]) -> tuple[str, ...]:
    """Extract ordered text packets from generated PiroInput records."""
    inputs = record.get("inputs")
    if not isinstance(inputs, list) or len(inputs) < 1:
        raise ValueError("training records must contain at least one input")
    texts: list[str] = []
    for item in inputs:
        parts = item.get("parts") if isinstance(item, dict) else None
        if not isinstance(parts, list) or not parts:
            raise ValueError("training inputs must contain text parts")
        text = parts[0].get("text") if isinstance(parts[0], dict) else None
        if not isinstance(text, str) or not text:
            raise ValueError("training input text must be a non-empty string")
        texts.append(text)
    return tuple(texts)
