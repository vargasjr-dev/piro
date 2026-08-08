"""Repository source entrypoint for the color-memory benchmark."""

from __future__ import annotations

from sources._common.training import Example, input_texts, read_jsonl, split_records
from sources.color_memory import main


def load_training_data(*, r2_client, bucket, prefix, split, limit):
    records = split_records(
        read_jsonl(r2_client=r2_client, bucket=bucket, prefix=prefix),
        split=split,
        limit=limit,
    )
    examples = []
    for record in records:
        texts = input_texts(record)
        examples.append(
            Example(
                inputs=texts,
                target=record["answer"],
                metadata={
                    "task": "color_memory",
                    "split": record.get("metadata", {}).get("split"),
                    "targetPerson": record.get("metadata", {}).get("targetPerson"),
                },
            )
        )
    return examples


if __name__ == "__main__":
    main()
