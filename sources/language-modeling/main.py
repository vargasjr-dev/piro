"""Repository source entrypoint for causal language modeling."""

from __future__ import annotations

from sources._common.training import Example, input_texts, read_jsonl, split_records
from sources.language_modeling import main


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
    main()
