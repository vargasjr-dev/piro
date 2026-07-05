"""
data/counter.py

Sequential counter task — the working-memory probe for CTM vs transformer.

Each sample is a sequence of INC/DEC tokens. The label is the final signed count
(INC = +1, DEC = -1). The model must maintain a running sum across the entire
sequence — exactly the kind of iterative state computation CTM's tick loop is
designed for.

Length-generalization is the killer test: train on short sequences (N ≤ 8),
test on long ones (N up to 48). Both a 870-param CTM and a 870-param BT can
learn the training distribution; the question is what happens at N > 8.

Public API
----------
CLI
---
    uv run python -m model.data.counter --split train --n 50000 --length-min 2 --length-max 8 --seed 42
    uv run python -m model.data.counter --split test  --n 1000  --length 16 --seed 42

CounterSample              — dataclass holding one (prompt, label, metadata) triple
generate_counter_sample    — single sample from explicit ops list
generate_counter_dataset   — list of samples with configurable length + split

Usage
-----
    from model.data.counter import generate_counter_dataset

    train = generate_counter_dataset(n=50_000, length=(2, 8), seed=0, split="train")
    test_long = generate_counter_dataset(n=1_000, length=16, seed=0, split="test")

    for s in train[:3]:
        print(s.prompt)
        print(s.label)
        print()
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

__all__ = [
    "CounterSample",
    "generate_counter_sample",
    "generate_counter_dataset",
]


# ---------------------------------------------------------------------------
# Data structure
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CounterSample:
    """
    One training / evaluation example.

    Attributes
    ----------
    prompt:
        Plain-text instruction + op sequence.  Passed directly to
        model.generate() or an Anthropic/OpenAI API call.
    label:
        The final signed count as a string (e.g. "-3", "0", "+5").
    sequence:
        The raw op sequence.  Each element is "INC" or "DEC".
    count:
        The signed integer answer (sum of +1 for INC, -1 for DEC).
    length:
        Number of ops in the sequence.
    metadata:
        Arbitrary extras — split name, index, generation seed, etc.
    """

    prompt: str
    label: str
    sequence: tuple[str, ...]
    count: int
    length: int
    metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

INC = "INC"
DEC = "DEC"
OPS: tuple[str, ...] = (INC, DEC)


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE = "{sequence}"

_LABEL_TEMPLATE = "{sign}{magnitude}"


def _make_prompt(ops: list[str]) -> str:
    return _PROMPT_TEMPLATE.format(sequence=" ".join(ops))


def _make_label(count: int) -> str:
    if count < 0:
        sign, magnitude = "-", str(-count)
    elif count > 0:
        sign, magnitude = "+", str(count)
    else:
        sign, magnitude = "", "0"
    return _LABEL_TEMPLATE.format(sign=sign, magnitude=magnitude)


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------

def generate_counter_sample(
    sequence: list[str],
    *,
    metadata: dict | None = None,
) -> CounterSample:
    """
    Build a CounterSample from an explicit op list.

    Parameters
    ----------
    sequence:
        List of "INC" / "DEC" tokens.  Need not be balanced — the count is
        whatever the net sum is.
    metadata:
        Arbitrary key-value pairs attached to the sample.

    Returns
    -------
    CounterSample
        prompt  — plain-text instruction ready for model.generate()
        label   — signed integer as a string
    """
    for op in sequence:
        if op not in OPS:
            raise ValueError(f"unknown op {op!r}; expected one of {OPS}")
    count = sum(1 if op == INC else -1 for op in sequence)
    return CounterSample(
        prompt=_make_prompt(sequence),
        label=_make_label(count),
        sequence=tuple(sequence),
        count=count,
        length=len(sequence),
        metadata=metadata or {},
    )


def generate_counter_dataset(
    n: int,
    *,
    length: int | tuple[int, int] = 8,
    seed: int = 42,
    split: str = "train",
    op_probs: tuple[float, float] = (0.5, 0.5),
) -> list[CounterSample]:
    """
    Generate a dataset of counter problems.

    Parameters
    ----------
    n:
        Number of samples to generate.
    length:
        If an int, all sequences have this length.
        If a (min, max) tuple, length is sampled uniformly in [min, max].
    seed:
        RNG seed.  The same seed + split always produces the same dataset.
        Different splits get different sub-seeds so train and test are
        disjoint in their random streams.
    split:
        Arbitrary label stored in sample metadata ("train", "test", "val", …).
    op_probs:
        (prob(INC), prob(DEC)).  Defaults to balanced (0.5, 0.5) so the
        counter is unbiased.  Set to (0.7, 0.3) to bias toward positive counts.

    Examples
    --------
    >>> train = generate_counter_dataset(50_000, length=(2, 8), seed=0, split="train")
    >>> test_long = generate_counter_dataset(1_000, length=16, seed=0, split="test")
    >>> print(train[0].prompt)
    Starting from 0, apply each operation in order.
    Reply with only the final integer, nothing else.
    <BLANKLINE>
    INC INC DEC INC DEC DEC
    >>> print(train[0].label)
    -1
    """
    # Offset seed by split so train/test/val never share the same stream
    split_offset = {"train": 0, "test": 1, "val": 2}.get(split, abs(hash(split)) % 1000)
    rng = random.Random(seed + split_offset)

    p_inc, p_dec = op_probs
    if abs((p_inc + p_dec) - 1.0) > 1e-6:
        raise ValueError(f"op_probs must sum to 1.0, got {op_probs}")

    samples: list[CounterSample] = []

    for i in range(n):
        if isinstance(length, tuple):
            seq_len = rng.randint(length[0], length[1])
        else:
            seq_len = length

        ops = [INC if rng.random() < p_inc else DEC for _ in range(seq_len)]

        samples.append(
            generate_counter_sample(
                ops,
                metadata={"split": split, "index": i, "seed": seed, "length": seq_len},
            )
        )

    return samples


if __name__ == "__main__":
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="Generate counter sequence samples as JSONL")
    parser.add_argument("--split", default="train", choices=["train", "test", "val"])
    parser.add_argument("--n", type=int, default=50_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--length", type=int, default=8, help="Fixed length if --length-min not set")
    parser.add_argument("--length-min", type=int, default=None, help="If set with --length-max, sample uniformly in [min, max]")
    parser.add_argument("--length-max", type=int, default=None)
    parser.add_argument("--p-inc", type=float, default=0.5, help="Probability of INC (default 0.5)")
    args = parser.parse_args()

    if args.length_min is not None and args.length_max is not None:
        if args.length_min > args.length_max:
            parser.error("--length-min must be <= --length-max")
        length_arg: int | tuple[int, int] = (args.length_min, args.length_max)
    else:
        length_arg = args.length

    op_probs = (args.p_inc, 1.0 - args.p_inc)
    samples = generate_counter_dataset(
        n=args.n,
        length=length_arg,
        seed=args.seed,
        split=args.split,
        op_probs=op_probs,
    )
    for s in samples:
        print(json.dumps({"prompt": s.prompt, "label": s.label, "metadata": s.metadata}))