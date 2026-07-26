"""Run the persistent-memory benchmark against a stateful CTM adapter.

This is intentionally separate from ``run_benchmarks.py``: the default runner
expects string-generation models, while persistent recall requires explicit
state snapshots between WRITE, DISTRACT, and QUERY invocations.
"""

from __future__ import annotations

import argparse

from architectures.ashfall.ctm import ContinuousThoughtModel, CTMConfig
from benchmarks.persistent_memory import (
    CTMStatefulMemoryAdapter,
    PersistentMemoryBenchmark,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episodes", type=int, default=200)
    parser.add_argument("--delay", type=int, default=8)
    parser.add_argument("--writes", type=int, default=3)
    parser.add_argument("--seed", type=int, default=12345)
    args = parser.parse_args()

    model = ContinuousThoughtModel(
        CTMConfig(n_classes=32, enable_plasticity=False),
    )
    adapter = CTMStatefulMemoryAdapter(model, value_count=32)
    result = PersistentMemoryBenchmark(
        n_episodes=args.episodes,
        n_writes=args.writes,
        delay=args.delay,
        seed=args.seed,
    ).run(adapter)
    print({"score": result.score, "passed": result.passed, **result.metadata})


if __name__ == "__main__":
    main()
