"""Repository source entrypoint for deterministic sorting sequences."""

from __future__ import annotations

from sources._common.training import Example, read_jsonl, split_records
from sources._common.sequences import generate_sorting_dataset


def load_training_data(*, r2_client, bucket, prefix, split, limit):
    records = split_records(
        read_jsonl(r2_client=r2_client, bucket=bucket, prefix=prefix),
        split=split,
        limit=limit,
    )
    return [
        Example(
            inputs=(record.get("prompt", ""),),
            target=record.get("label"),
            metadata={"task": "sorting"},
        )
        for record in records
    ]


def main() -> None:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Generate sorting sequence samples as JSONL")
    parser.add_argument("--split", default="train", choices=["train", "test"])
    parser.add_argument("--n", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--length", type=int, default=4)
    args = parser.parse_args()

    for sample in generate_sorting_dataset(
        n=args.n,
        length=args.length,
        seed=args.seed,
        split=args.split,
    ):
        print(
            json.dumps(
                {"prompt": sample.prompt, "label": sample.label, "metadata": sample.metadata}
            )
        )


if __name__ == "__main__":
    main()
