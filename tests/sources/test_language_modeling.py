from __future__ import annotations

from collections import defaultdict

from sources._common.training import load_source_examples
from sources.language_modeling import DatasetSpec, SourceRow, generate_language_modeling_dataset


MIXTURE = (
    DatasetSpec("web", "web", "default", 0.5),
    DatasetSpec("math", "math", "default", 0.5),
)


def _fetcher(spec, offset, length):
    rows = [
        SourceRow(
            text=f"{spec.name} sample {index} " + ("language modeling text. " * 20),
            record_id=f"{spec.name}:{index}",
            metadata={"fixture": True},
        )
        for index in range(100)
    ]
    return rows[offset : offset + length], len(rows)


def test_language_modeling_generation_is_deterministic_and_splits_are_disjoint():
    first = generate_language_modeling_dataset(
        train_samples=10,
        eval_samples=6,
        seed=7,
        chunk_characters=128,
        mixture=MIXTURE,
        fetcher=_fetcher,
    )
    second = generate_language_modeling_dataset(
        train_samples=10,
        eval_samples=6,
        seed=7,
        chunk_characters=128,
        mixture=MIXTURE,
        fetcher=_fetcher,
    )

    assert first == second
    train_ids = {
        record["metadata"]["recordId"] for record in first if record["metadata"]["split"] == "train"
    }
    eval_ids = {
        record["metadata"]["recordId"] for record in first if record["metadata"]["split"] == "eval"
    }
    assert len(first) == 16
    assert train_ids.isdisjoint(eval_ids)
    assert {record["metadata"]["datasetName"] for record in first} == {"web", "math"}
    assert all(record["target"] == "" for record in first)


class _Body:
    def __init__(self, value: str):
        self.value = value

    def read(self):
        return self.value.encode()


class _R2:
    def get_object(self, *, Bucket, Key):
        assert Bucket == "test"
        assert Key == "datasets/lm/train.jsonl"
        records = generate_language_modeling_dataset(
            train_samples=1,
            eval_samples=1,
            seed=1,
            chunk_characters=128,
            mixture=MIXTURE,
            fetcher=_fetcher,
        )
        import json

        return {"Body": _Body("\n".join(json.dumps(record) for record in records))}


def test_language_modeling_entrypoint_decodes_text_examples():
    examples = load_source_examples(
        source_path="sources/language-modeling/main.py",
        r2_client=_R2(),
        bucket="test",
        prefix="datasets/lm",
        split="train",
        limit=1,
    )

    assert len(examples) == 1
    assert examples[0].metadata["task"] == "language_modeling"
    assert examples[0].inputs[0].startswith(("web sample", "math sample"))
    assert examples[0].target == ""
