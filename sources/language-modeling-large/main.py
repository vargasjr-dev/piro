"""Repository source entrypoint for large-scale causal language modeling.

Generation uses the same FineWeb-Edu + Dolma mixture as
``sources/language_modeling`` but emits a corpus sized for the Corona
training plan: 45,000 training and 5,000 evaluation samples (~50M tokens at
~4 characters per token). Training-time decoding delegates to the shared
source-owned adapter contract.
"""

from __future__ import annotations

import json

from sources._common.training import Example, input_texts, read_jsonl, split_records
from sources.language_modeling import generate_language_modeling_dataset, main  # noqa: F401


def load_training_data(*, r2_client, bucket, prefix, split, limit):
    records = split_records(
        read_jsonl(r2_client=r2_client, bucket=bucket, prefix=prefix),
        split=split,
        limit=limit,
    )
    examples = []
    for record in records:
        metadata = dict(record.get("metadata", {}))
        examples.append(
            Example(
                inputs=input_texts(record),
                target=record.get("target", ""),
                continuation_prefix="",
                metadata=metadata,
            )
        )
    return examples


if __name__ == "__main__":
    for record in generate_language_modeling_dataset(
        train_samples=45000,
        eval_samples=5000,
        chunk_characters=4096,
    ):
        print(json.dumps(record, separators=(",", ":")))
