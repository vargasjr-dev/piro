"""Repository source entrypoint for deterministic sorting sequences."""

from __future__ import annotations

import argparse
import json

from sources._common.sequences import generate_sorting_dataset


def main() -> None:
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
