"""Repository source entrypoint for persistent associative recall."""

from __future__ import annotations

from sources._common.training import Example, input_texts, read_jsonl, split_records
from sources.associative_recall import main


def load_training_data(*, r2_client, bucket, prefix, split, limit):
    records = split_records(
        read_jsonl(r2_client=r2_client, bucket=bucket, prefix=prefix),
        split=split,
        limit=limit,
    )
    examples = []
    for record in records:
        texts = input_texts(record)
        query = texts[-1]
        observations = texts[:-1]
        target = next(
            (
                line
                for observation in observations
                for line in observation.splitlines()
                if line.startswith(f"{query} = ")
            ),
            None,
        )
        if target is None:
            raise ValueError(f"no write found for query {query!r}")
        examples.append(
            Example(
                inputs=tuple(observations) + (query,),
                target=target.split("=", maxsplit=1)[1].strip(),
                continuation_prefix="\nANSWER:",
                metadata={"task": "memory"},
            )
        )
    return examples


if __name__ == "__main__":
    main()
