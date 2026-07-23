"""Persistent associative-recall episodes as ordered PiroInput packets.

Each episode has a variable number of invocation boundaries: one or more
key/value observation packets, zero or more distractor packets, and a final
key-only query packet. The public JSONL contract intentionally exposes only
``{"inputs": PiroInput[]}``; semantic roles are inferable from observation
content and ordering rather than role fields.

Each PiroInput follows the architecture-page observation contract:
``{"parts": [{"type": "text", "text": "..."}]}``.
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class MemoryFact:
    key: str
    value: str


def _text_input(text: str) -> dict[str, object]:
    """Serialize one text observation using the documented PiroInput shape."""
    return {"parts": [{"type": "text", "text": text}]}


def _choose_range(value: int | tuple[int, int], rng: random.Random) -> int:
    if isinstance(value, int):
        if value < 1:
            raise ValueError("range values must be positive")
        return value
    low, high = value
    if low < 1 or low > high:
        raise ValueError("range must satisfy 1 <= low <= high")
    return rng.randint(low, high)


def _partition(items: list[str], packet_count: int, rng: random.Random) -> tuple[str, ...]:
    """Split ordered observations into non-empty packets with varied boundaries."""
    if not items:
        return ()
    packet_count = min(max(1, packet_count), len(items))
    if packet_count == 1:
        return ("\n".join(items),)
    boundaries = sorted(rng.sample(range(1, len(items)), packet_count - 1))
    starts = [0, *boundaries]
    ends = [*boundaries, len(items)]
    return tuple("\n".join(items[start:end]) for start, end in zip(starts, ends, strict=True))


@dataclass(frozen=True)
class MemoryEpisode:
    writes: tuple[MemoryFact, ...]
    distractors: tuple[str, ...]
    target_key: str
    answer: str
    metadata: dict[str, int | str]
    write_packets: tuple[str, ...]
    distractor_packets: tuple[str, ...]

    @property
    def write_observation(self) -> str:
        return "\n".join(f"{fact.key} = {fact.value}" for fact in self.writes)

    @property
    def distractor_observation(self) -> str:
        return "\n".join(self.distractors)

    @property
    def query_observation(self) -> str:
        return self.target_key

    @property
    def inputs(self) -> tuple[dict[str, object], ...]:
        """Return ordered role-free PiroInput observation packets."""
        return tuple(
            _text_input(text)
            for text in (*self.write_packets, *self.distractor_packets, self.query_observation)
        )

    @property
    def request_count(self) -> int:
        return len(self.inputs)

    def as_json(self) -> dict[str, object]:
        """Return the public JSONL record with no schema-level role labels."""
        return {"inputs": list(self.inputs)}


def make_memory_episode(
    *,
    n_writes: int | tuple[int, int] = (2, 6),
    delay: int | tuple[int, int] = (4, 16),
    write_requests: int | tuple[int, int] = (1, 4),
    distractor_requests: int | tuple[int, int] = (1, 8),
    seed: int | None = None,
    index: int = 0,
    split: str = "train",
    value_count: int = 32,
) -> MemoryEpisode:
    """Create one deterministic key/value recall episode with varied boundaries."""
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
    write_lines = [f"{fact.key} = {fact.value}" for fact in writes]
    write_packet_count = _choose_range(write_requests, rng)
    distractor_packet_count = (
        _choose_range(distractor_requests, rng) if distractors else 0
    )
    write_packets = _partition(write_lines, write_packet_count, rng)
    distractor_packets = _partition(list(distractors), distractor_packet_count, rng)
    metadata: dict[str, int | str] = {
        "split": split,
        "index": index,
        "seed": seed if seed is not None else -1,
        "n_writes": write_count,
        "delay": delay_count,
        "write_requests": len(write_packets),
        "distractor_requests": len(distractor_packets),
        "request_count": len(write_packets) + len(distractor_packets) + 1,
        "target_key": target.key,
    }
    return MemoryEpisode(
        writes,
        distractors,
        target.key,
        target.value,
        metadata,
        write_packets,
        distractor_packets,
    )


def generate_associative_recall_dataset(
    n: int,
    *,
    n_writes: int | tuple[int, int] = (2, 6),
    delay: int | tuple[int, int] = (4, 16),
    write_requests: int | tuple[int, int] = (1, 4),
    distractor_requests: int | tuple[int, int] = (1, 8),
    seed: int = 42,
    split: str = "train",
    value_count: int = 32,
) -> list[MemoryEpisode]:
    """Generate reproducible ordered PiroInput recall episodes."""
    if n < 0:
        raise ValueError("n must be non-negative")
    episodes: list[MemoryEpisode] = []
    for index in range(n):
        episode_seed = seed + index * 1_000_003
        episodes.append(
            make_memory_episode(
                n_writes=n_writes,
                delay=delay,
                write_requests=write_requests,
                distractor_requests=distractor_requests,
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate persistent write/query memory episodes")
    parser.add_argument("--n", type=int, default=10_000)
    parser.add_argument("--n-writes", type=_parse_range, default="2-6")
    parser.add_argument("--delay", type=_parse_range, default="4-16")
    parser.add_argument("--write-requests", type=_parse_range, default="1-4")
    parser.add_argument("--distractor-requests", type=_parse_range, default="1-8")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--split", type=str, default="train")
    parser.add_argument("--value-count", type=int, default=32)
    args = parser.parse_args()

    episodes = generate_associative_recall_dataset(
        args.n,
        n_writes=args.n_writes,
        delay=args.delay,
        write_requests=args.write_requests,
        distractor_requests=args.distractor_requests,
        seed=args.seed,
        split=args.split,
        value_count=args.value_count,
    )
    for episode in episodes:
        print(json.dumps(episode.as_json()))


if __name__ == "__main__":
    main()
