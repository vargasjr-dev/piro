"""Persistent write/query memory episodes.

Each episode has three explicit invocation boundaries:

1. ``WRITE`` stores key/value facts.
2. ``DISTRACT`` creates a delay without exposing the target answer.
3. ``QUERY`` asks for one value after the write context is gone.

The generator deliberately returns the three prompts separately. A benchmark
must not concatenate them into one context window, or it stops measuring
persistent memory and becomes ordinary sequence completion.
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class MemoryFact:
    key: str
    value: str


@dataclass(frozen=True)
class MemoryEpisode:
    writes: tuple[MemoryFact, ...]
    distractors: tuple[str, ...]
    target_key: str
    answer: str
    metadata: dict[str, int | str]

    @property
    def write_prompt(self) -> str:
        return "\n".join(f"WRITE {fact.key} {fact.value}" for fact in self.writes)

    @property
    def distractor_prompt(self) -> str:
        return "\n".join(f"DISTRACT {item}" for item in self.distractors)

    @property
    def query_prompt(self) -> str:
        return f"QUERY {self.target_key}"

    def as_json(self) -> dict[str, object]:
        return {
            "write": self.write_prompt,
            "distractors": self.distractor_prompt,
            "query": self.query_prompt,
            "label": self.answer,
            "metadata": self.metadata,
        }


def _choose_range(value: int | tuple[int, int], rng: random.Random) -> int:
    if isinstance(value, int):
        if value < 1:
            raise ValueError("range values must be positive")
        return value
    low, high = value
    if low < 1 or low > high:
        raise ValueError("range must satisfy 1 <= low <= high")
    return rng.randint(low, high)


def make_memory_episode(
    *,
    n_writes: int | tuple[int, int] = (2, 6),
    delay: int | tuple[int, int] = (4, 16),
    seed: int | None = None,
    index: int = 0,
    split: str = "train",
    value_count: int = 32,
) -> MemoryEpisode:
    """Create one deterministic key/value recall episode."""
    rng = random.Random(seed)
    write_count = _choose_range(n_writes, rng)
    delay_count = _choose_range(delay, rng) if delay != 0 else 0
    if value_count < write_count:
        raise ValueError("value_count must be at least the number of writes")

    keys = [f"key_{i:03d}" for i in rng.sample(range(value_count), write_count)]
    values = [f"value_{rng.randrange(value_count):03d}" for _ in range(write_count)]
    writes = tuple(MemoryFact(key, value) for key, value in zip(keys, values, strict=True))
    target = rng.choice(writes)

    distractors = tuple(
        f"token_{rng.randrange(value_count):03d}_{rng.randrange(value_count):03d}"
        for _ in range(delay_count)
    )
    metadata: dict[str, int | str] = {
        "split": split,
        "index": index,
        "seed": seed if seed is not None else -1,
        "n_writes": write_count,
        "delay": delay_count,
        "target_key": target.key,
    }
    return MemoryEpisode(writes, distractors, target.key, target.value, metadata)


def generate_associative_recall_dataset(
    n: int,
    *,
    n_writes: int | tuple[int, int] = (2, 6),
    delay: int | tuple[int, int] = (4, 16),
    seed: int = 42,
    split: str = "train",
    value_count: int = 32,
) -> list[MemoryEpisode]:
    """Generate reproducible write/delay/query episodes."""
    if n < 0:
        raise ValueError("n must be non-negative")
    episodes: list[MemoryEpisode] = []
    for index in range(n):
        episode_seed = seed + index * 1_000_003
        episodes.append(
            make_memory_episode(
                n_writes=n_writes,
                delay=delay,
                seed=episode_seed,
                index=index,
                split=split,
                value_count=value_count,
            )
        )
    return episodes


def _parse_range(value: str) -> int | tuple[int, int]:
    if "-" not in value:
        return int(value)
    low, high = value.split("-", maxsplit=1)
    return int(low), int(high)


def _main() -> None:
    parser = argparse.ArgumentParser(description="Generate persistent write/query memory episodes")
    parser.add_argument("--n", type=int, default=1000)
    parser.add_argument("--n-writes", type=_parse_range, default="2-6")
    parser.add_argument("--delay", type=_parse_range, default="4-16")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--split", type=str, default="train")
    parser.add_argument("--value-count", type=int, default=32)
    args = parser.parse_args()

    episodes = generate_associative_recall_dataset(
        args.n,
        n_writes=args.n_writes,
        delay=args.delay,
        seed=args.seed,
        split=args.split,
        value_count=args.value_count,
    )
    for episode in episodes:
        print(json.dumps(episode.as_json()))


if __name__ == "__main__":
    _main()
