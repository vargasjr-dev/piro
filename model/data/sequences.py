"""
data/sequences.py

Sequence generation utility for sorting tasks.

Produces plain-text prompts and ground-truth labels suitable for:
  - GRPO training rollouts (prompt → N student responses → mentor scores)
  - Benchmark evaluation (model.generate(sample.prompt) → check vs sample.label)
  - GPT baseline scoring (prompts are plain English, no special tokens)

All generation is deterministic when a seed is provided, so train/test splits
are reproducible across runs and machines.

Public API
----------
CLI
---
    # Emit JSONL to stdout
    uv run python -m model.data.sequences --split train --n 5000 --seed 42
    uv run python -m model.data.sequences --split test  --n 1000 --seed 42

SequenceSample      — dataclass holding one (prompt, label, metadata) triple
generate_sorting_sample  — single sample from explicit inputs
generate_sorting_dataset — list of samples with configurable length + split

Usage
-----
    from model.data.sequences import generate_sorting_dataset

    train = generate_sorting_dataset(n=1000, length=5, seed=0, split="train")
    test  = generate_sorting_dataset(n=200,  length=20, seed=0, split="test")

    for sample in train[:3]:
        print(sample.prompt)
        print(sample.label)
        print()
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

__all__ = ["SequenceSample", "generate_sorting_sample", "generate_sorting_dataset"]


# ---------------------------------------------------------------------------
# Data structure
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SequenceSample:
    """
    One training / evaluation example.

    Attributes
    ----------
    prompt:
        Plain-text instruction + unsorted sequence.  Passed directly to
        model.generate() or an Anthropic/OpenAI API call — no tokenization
        or special-token wrapping needed.
    label:
        Ground-truth response the model should produce.  Space-separated
        integers in ascending order.  Used by benchmarks and the GRPO reward
        function (exact-match or partial-credit scoring).
    sequence:
        The raw unsorted list.  Kept for downstream analysis without having
        to re-parse the prompt.
    sorted_sequence:
        The raw sorted list.  Kept for downstream analysis without having
        to re-parse the label.
    length:
        Number of integers in the sequence.  Useful for grouping samples
        by difficulty.
    metadata:
        Arbitrary extras — split name, index, generation seed, etc.
    """

    prompt: str
    label: str
    sequence: tuple[int, ...]
    sorted_sequence: tuple[int, ...]
    length: int
    metadata: dict = field(default_factory=dict)

    def is_correct(self, reply: str) -> bool:
        """
        Return True if ``reply`` matches the ground-truth label.

        Strips whitespace and normalises separators (spaces or commas) before
        comparing, so minor formatting differences don't count as wrong.
        """
        def _normalise(s: str) -> list[int]:
            import re
            tokens = re.findall(r"\d+", s)
            return [int(t) for t in tokens]

        try:
            return _normalise(reply) == list(self.sorted_sequence)
        except ValueError:
            return False


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE = (
    "Sort the following numbers in ascending order.\n"
    "Reply with only the sorted numbers separated by spaces, nothing else.\n\n"
    "{sequence}"
)

_LABEL_TEMPLATE = "{sorted_sequence}"


def _make_prompt(sequence: list[int]) -> str:
    return _PROMPT_TEMPLATE.format(sequence=" ".join(str(n) for n in sequence))


def _make_label(sorted_sequence: list[int]) -> str:
    return _LABEL_TEMPLATE.format(
        sorted_sequence=" ".join(str(n) for n in sorted_sequence)
    )


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------

def generate_sorting_sample(
    sequence: list[int],
    *,
    metadata: dict | None = None,
) -> SequenceSample:
    """
    Build a SequenceSample from an explicit integer list.

    Parameters
    ----------
    sequence:
        Unsorted list of integers.  Need not be distinct.
    metadata:
        Arbitrary key-value pairs attached to the sample.

    Returns
    -------
    SequenceSample
        prompt  — plain-text instruction ready for model.generate()
        label   — space-separated sorted integers
    """
    s = sorted(sequence)
    return SequenceSample(
        prompt=_make_prompt(sequence),
        label=_make_label(s),
        sequence=tuple(sequence),
        sorted_sequence=tuple(s),
        length=len(sequence),
        metadata=metadata or {},
    )


def generate_sorting_dataset(
    n: int,
    *,
    length: int | tuple[int, int] = 5,
    value_range: tuple[int, int] = (1, 999),
    unique: bool = True,
    seed: int = 42,
    split: str = "train",
) -> list[SequenceSample]:
    """
    Generate a dataset of sorting problems.

    Parameters
    ----------
    n:
        Number of samples to generate.
    length:
        If an int, all sequences have this length.
        If a (min, max) tuple, length is sampled uniformly in [min, max].
    value_range:
        (lo, hi) inclusive range for integer values.
    unique:
        If True (default), each sequence contains distinct integers.
        Set False to allow repeats (harder for the model — ties in sorted order).
    seed:
        RNG seed.  The same seed + split always produces the same dataset.
        Different splits get different sub-seeds so train and test are disjoint
        in their random streams.
    split:
        Arbitrary label stored in sample metadata ("train", "test", "val", …).

    Returns
    -------
    list[SequenceSample]
        Deterministic, reproducible list of n samples.

    Examples
    --------
    >>> train = generate_sorting_dataset(100, length=5, seed=0, split="train")
    >>> test  = generate_sorting_dataset(20,  length=20, seed=0, split="test")
    >>> print(train[0].prompt)
    Sort the following numbers in ascending order.
    Reply with only the sorted numbers separated by spaces, nothing else.
    <BLANKLINE>
    317 42 891 156 73
    >>> print(train[0].label)
    42 73 156 317 891
    """
    # Offset seed by split so train/test/val never share the same stream
    split_offset = {"train": 0, "test": 1, "val": 2}.get(split, abs(hash(split)) % 1000)
    rng = random.Random(seed + split_offset)

    lo, hi = value_range
    samples: list[SequenceSample] = []

    for i in range(n):
        if isinstance(length, tuple):
            seq_len = rng.randint(length[0], length[1])
        else:
            seq_len = length

        if unique:
            if (hi - lo + 1) < seq_len:
                raise ValueError(
                    f"value_range {value_range} too small for unique sequence of length {seq_len}"
                )
            seq = rng.sample(range(lo, hi + 1), seq_len)
        else:
            seq = [rng.randint(lo, hi) for _ in range(seq_len)]

        samples.append(
            generate_sorting_sample(
                seq,
                metadata={"split": split, "index": i, "seed": seed},
            )
        )

    return samples


if __name__ == "__main__":
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="Generate sorting sequence samples as JSONL")
    parser.add_argument("--split", default="train", choices=["train", "test"])
    parser.add_argument("--n", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--length", type=int, default=4)
    parser.add_argument("--n-classes", type=int, default=5)
    args = parser.parse_args()

    samples = generate_sorting_dataset(n=args.n, length=args.length, seed=args.seed, split=args.split)
    for s in samples:
        print(json.dumps({"prompt": s.prompt, "label": s.label, "metadata": s.metadata}))
