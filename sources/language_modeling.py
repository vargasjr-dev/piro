"""Deterministic, streamable causal-language-modeling source.

The source deliberately uses Hugging Face's public Dataset Viewer rows API for
parquet-backed datasets and direct gzip JSONL shards for Dolma. It emits bounded
text chunks rather than embedding a corpus in the source request, so the same
source can drive a small fixture run or a much larger Modal generation job.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import random
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

DATASET_VIEWER_URL = "https://datasets-server.huggingface.co/rows"
DOLMA_URLS = "https://huggingface.co/datasets/allenai/dolma/resolve/main/urls/v1_7.txt?download=true"


@dataclass(frozen=True)
class DatasetSpec:
    """One source in the pretraining mixture."""

    name: str
    dataset: str
    config: str
    weight: float
    text_field: str = "text"
    kind: str = "viewer"
    license: str | None = None


# The proportions are intentionally explicit and easy to ablate. Dolma is read
# from its official shard manifest because its Dataset Viewer is disabled.
DEFAULT_MIXTURE: tuple[DatasetSpec, ...] = (
    DatasetSpec(
        name="fineweb_edu",
        dataset="HuggingFaceFW/fineweb-edu",
        config="sample-10BT",
        weight=0.60,
        license="odc-by",
    ),
    DatasetSpec(
        name="dolma",
        dataset="allenai/dolma",
        config="v1_7",
        weight=0.15,
        kind="dolma",
        license="odc-by",
    ),
    DatasetSpec(
        name="openwebmath",
        dataset="open-web-math/open-web-math",
        config="default",
        weight=0.10,
        license="odc-by",
    ),
    DatasetSpec(
        name="python_edu",
        dataset="HuggingFaceTB/smollm-corpus",
        config="python-edu",
        weight=0.10,
        text_field="blob_id",
        kind="swh",
        license="odc-by",
    ),
    DatasetSpec(
        name="cosmopedia",
        dataset="HuggingFaceTB/smollm-corpus",
        config="cosmopedia-v2",
        weight=0.05,
        license="odc-by",
    ),
)


@dataclass(frozen=True)
class SourceRow:
    text: str
    record_id: str
    metadata: dict[str, Any]


RowFetcher = Callable[[DatasetSpec, int, int], tuple[list[SourceRow], int | None]]


def _http_json(url: str, *, timeout: int = 60) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "piro-language-modeling-source/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _nested_value(row: dict[str, Any], field: str) -> Any:
    value: Any = row
    for part in field.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _clean_text(value: Any, *, max_characters: int) -> str:
    if not isinstance(value, str):
        return ""
    text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(text) > max_characters:
        text = text[:max_characters].rsplit(" ", maxsplit=1)[0].strip()
    return text


def _viewer_rows(spec: DatasetSpec, offset: int, length: int) -> tuple[list[SourceRow], int | None]:
    query = urllib.parse.urlencode(
        {
            "dataset": spec.dataset,
            "config": spec.config,
            "split": "train",
            "offset": offset,
            "length": min(length, 100),
        }
    )
    payload = _http_json(f"{DATASET_VIEWER_URL}?{query}")
    rows: list[SourceRow] = []
    for item in payload.get("rows", []):
        row = item.get("row", {})
        value = _nested_value(row, spec.text_field)
        text = _clean_text(value, max_characters=100_000)
        if text:
            row_index = item.get("row_idx", offset + len(rows))
            rows.append(
                SourceRow(
                    text=text,
                    record_id=f"{spec.dataset}:{spec.config}:{row_index}",
                    metadata={"rowIndex": row_index},
                )
            )
    total = payload.get("num_rows_total")
    return rows, int(total) if isinstance(total, int) else None


def _swh_text(blob_id: str) -> str:
    if not blob_id:
        return ""
    url = f"https://softwareheritage.s3.amazonaws.com/content/{urllib.parse.quote(blob_id)}"
    request = urllib.request.Request(url, headers={"User-Agent": "piro-language-modeling-source/1"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            with gzip.GzipFile(fileobj=response) as compressed:
                return compressed.read().decode("utf-8", errors="ignore")
    except OSError:
        return ""


def _swh_rows(spec: DatasetSpec, offset: int, length: int) -> tuple[list[SourceRow], int | None]:
    rows, total = _viewer_rows(spec, offset, length)
    hydrated: list[SourceRow] = []
    for row in rows:
        text = _clean_text(_swh_text(row.text), max_characters=100_000)
        if text:
            hydrated.append(
                SourceRow(text=text, record_id=row.record_id, metadata=row.metadata)
            )
    return hydrated, total


def _dolma_urls() -> list[str]:
    request = urllib.request.Request(DOLMA_URLS, headers={"User-Agent": "piro-language-modeling-source/1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return [line.strip() for line in response.read().decode("utf-8").splitlines() if line.strip()]


def _dolma_rows(spec: DatasetSpec, offset: int, length: int) -> tuple[list[SourceRow], int | None]:
    del spec
    urls = _dolma_urls()
    if not urls:
        return [], 0
    url = urls[offset % len(urls)]
    request = urllib.request.Request(url, headers={"User-Agent": "piro-language-modeling-source/1"})
    rows: list[SourceRow] = []
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            with gzip.GzipFile(fileobj=response) as compressed:
                for line_number, line in enumerate(compressed, start=1):
                    if line_number <= offset % 100_000:
                        continue
                    if len(rows) >= length:
                        break
                    try:
                        row = json.loads(line.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        continue
                    text = _clean_text(row.get("text"), max_characters=100_000)
                    if text:
                        rows.append(
                            SourceRow(
                                text=text,
                                record_id=str(row.get("id", f"dolma:{url}:{line_number}")),
                                metadata={"source": row.get("source"), "created": row.get("created")},
                            )
                        )
    except (OSError, urllib.error.URLError):
        return [], None
    return rows, None


def fetch_rows(spec: DatasetSpec, offset: int, length: int) -> tuple[list[SourceRow], int | None]:
    """Fetch a bounded page from one configured dataset."""
    if spec.kind == "viewer":
        return _viewer_rows(spec, offset, length)
    if spec.kind == "swh":
        return _swh_rows(spec, offset, length)
    if spec.kind == "dolma":
        return _dolma_rows(spec, offset, length)
    raise ValueError(f"unsupported dataset kind: {spec.kind}")


def _allocate_counts(total: int, mixture: tuple[DatasetSpec, ...]) -> list[int]:
    raw = [total * spec.weight for spec in mixture]
    counts = [int(value) for value in raw]
    for index in sorted(range(len(raw)), key=lambda item: raw[item] - counts[item], reverse=True)[: total - sum(counts)]:
        counts[index] += 1
    return counts


def _chunk_text(text: str, *, chunk_characters: int) -> Iterator[str]:
    if chunk_characters < 128:
        raise ValueError("chunk_characters must be at least 128")
    for start in range(0, len(text), chunk_characters):
        chunk = text[start : start + chunk_characters].strip()
        if len(chunk) >= 128:
            yield chunk


def _record(row: SourceRow, *, spec: DatasetSpec, split: str, index: int) -> dict[str, Any]:
    return {
        "inputs": [{"parts": [{"type": "text", "text": row.text}]}],
        "target": "",
        "metadata": {
            "task": "language_modeling",
            "split": split,
            "index": index,
            "dataset": spec.dataset,
            "datasetConfig": spec.config,
            "datasetName": spec.name,
            "recordId": row.record_id,
            "license": spec.license,
            **row.metadata,
        },
    }


def generate_language_modeling_dataset(
    *,
    train_samples: int = 500,
    eval_samples: int = 100,
    seed: int = 42,
    chunk_characters: int = 4096,
    mixture: tuple[DatasetSpec, ...] = DEFAULT_MIXTURE,
    fetcher: RowFetcher = fetch_rows,
) -> list[dict[str, Any]]:
    """Generate deterministic train/eval JSONL records from the mixture.

    The fetcher parameter is intentionally injectable for local fixtures and
    tests; production generation uses ``fetch_rows`` and never needs the full
    corpus on disk.
    """
    if train_samples < 1 or eval_samples < 1:
        raise ValueError("train_samples and eval_samples must be positive")
    if not mixture or any(spec.weight <= 0 for spec in mixture):
        raise ValueError("mixture must contain positive dataset weights")
    weight_total = sum(spec.weight for spec in mixture)
    if abs(weight_total - 1.0) > 1e-6:
        raise ValueError("mixture weights must sum to 1")

    rng = random.Random(seed)
    records: list[dict[str, Any]] = []
    cursors: dict[tuple[str, str], int] = {}
    totals: dict[str, int | None] = {}

    for split, count in (("train", train_samples), ("eval", eval_samples)):
        counts = _allocate_counts(count, mixture)
        order = [index for index, amount in enumerate(counts) for _ in range(amount)]
        rng.shuffle(order)
        produced = 0
        attempts = 0
        max_attempts = max(100, count * 20)
        while produced < count and attempts < max_attempts:
            attempts += 1
            spec_index = order[produced % len(order)]
            spec = mixture[spec_index]
            key = (spec.name, split)
            offset = cursors.get(key, 0)
            rows, total = fetcher(spec, offset, 8)
            if total is not None:
                totals[spec.name] = total
            if not rows:
                cursors[key] = offset + 8
                continue
            row = rows[0]
            cursors[key] = offset + 1
            chunks = list(_chunk_text(row.text, chunk_characters=chunk_characters))
            if not chunks:
                continue
            chunk = chunks[rng.randrange(len(chunks))]
            chunk_row = SourceRow(text=chunk, record_id=row.record_id, metadata=row.metadata)
            records.append(_record(chunk_row, spec=spec, split=split, index=len(records)))
            produced += 1
        if produced < count:
            raise RuntimeError(f"unable to produce {count} {split} records after {attempts} fetch attempts")

    return records


def _fixture_fetcher(path: str) -> RowFetcher:
    fixture_rows = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]

    def fetcher(spec: DatasetSpec, offset: int, length: int) -> tuple[list[SourceRow], int | None]:
        matching = [row for row in fixture_rows if row.get("dataset", spec.dataset) in {spec.dataset, spec.name}]
        selected = matching[offset : offset + length]
        return [
            SourceRow(
                text=str(row.get("text", "")),
                record_id=str(row.get("id", f"fixture:{spec.name}:{offset + index}")),
                metadata={"fixture": True},
            )
            for index, row in enumerate(selected)
            if str(row.get("text", "")).strip()
        ], len(matching)

    return fetcher


def parse_mixture(value: str | None) -> tuple[DatasetSpec, ...]:
    if not value:
        return DEFAULT_MIXTURE
    payload = json.loads(value)
    if not isinstance(payload, list):
        raise ValueError("mixture must be a JSON list")
    specs = tuple(DatasetSpec(**item) for item in payload)
    total = sum(spec.weight for spec in specs)
    if abs(total - 1.0) > 1e-6:
        raise ValueError("mixture weights must sum to 1")
    return specs


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate causal language-modeling JSONL records")
    parser.add_argument("--train-samples", type=int, default=500)
    parser.add_argument("--eval-samples", type=int, default=100)
    parser.add_argument("--chunk-characters", type=int, default=4096)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fixture", type=str)
    parser.add_argument("--mixture", type=str, help="JSON list of DatasetSpec objects")
    args = parser.parse_args()
    fetcher = _fixture_fetcher(args.fixture) if args.fixture else fetch_rows
    for record in generate_language_modeling_dataset(
        train_samples=args.train_samples,
        eval_samples=args.eval_samples,
        seed=args.seed,
        chunk_characters=args.chunk_characters,
        mixture=parse_mixture(args.mixture),
        fetcher=fetcher,
    ):
        print(json.dumps(record, separators=(",", ":")))


if __name__ == "__main__":
    main()
