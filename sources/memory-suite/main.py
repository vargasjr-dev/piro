"""Repository source entrypoint for the fixed MemorySuite evaluation dataset."""

from __future__ import annotations

from sources._common.training import Example, input_texts, read_jsonl, split_records
from sources.memory_suite import main


def load_training_data(*, r2_client, bucket, prefix, split, limit):
    records = split_records(
        read_jsonl(r2_client=r2_client, bucket=bucket, prefix=prefix),
        split=split,
        limit=limit,
    )
    return [
        Example(
            inputs=input_texts(record),
            target=record["answer"],
            continuation_prefix="\nANSWER:",
            metadata=record.get("metadata", {}),
        )
        for record in records
    ]


if __name__ == "__main__":
    main()
