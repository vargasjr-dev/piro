"""Benchmark for explicit persistent write/query memory.

The benchmark requires a model with an explicit state API:

    state = model.initial_state()
    _, state = model.step(prompt, state)
    answer, state = model.step(query, state)

The write and query prompts are never concatenated. Conditions deliberately
compare retained state, reset state, and serialized/restored state so a score
can be attributed to memory rather than ordinary context processing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .base import Benchmark, BenchmarkResult
from model.data.associative_recall import MemoryEpisode, generate_associative_recall_dataset


class StatefulMemoryModel(Protocol):
    def initial_state(self) -> Any: ...

    def step(self, prompt: str, state: Any) -> tuple[str, Any]: ...

    def reset_state(self, state: Any) -> Any: ...

    def snapshot_state(self, state: Any) -> Any: ...

    def load_state(self, snapshot: Any) -> Any: ...


@dataclass(frozen=True)
class MemoryConditionResult:
    name: str
    accuracy: float
    correct: int
    total: int
    failures: tuple[dict[str, str], ...]


class PersistentMemoryBenchmark(Benchmark):
    """Measure retrieval after a hidden delay and explicit state boundary."""

    name = "PersistentMemory"
    threshold = 0.8

    def __init__(
        self,
        *,
        n_episodes: int = 200,
        n_writes: int | tuple[int, int] = (2, 6),
        delay: int | tuple[int, int] = (4, 16),
        seed: int = 12345,
        value_count: int = 32,
    ) -> None:
        self.n_episodes = n_episodes
        self.n_writes = n_writes
        self.delay = delay
        self.seed = seed
        self.value_count = value_count

    def run(self, model: StatefulMemoryModel) -> BenchmarkResult:
        episodes = generate_associative_recall_dataset(
            self.n_episodes,
            n_writes=self.n_writes,
            delay=self.delay,
            seed=self.seed,
            split="eval",
            value_count=self.value_count,
        )
        retained = self._evaluate_condition(model, episodes, "retained")
        reset = self._evaluate_condition(model, episodes, "reset_before_query")
        restored = self._evaluate_condition(model, episodes, "serialized_restore")
        return self.result(
            retained.accuracy,
            baseline_scores={"random": 1.0 / self.value_count, "reset": reset.accuracy},
            metadata={
                "n_episodes": self.n_episodes,
                "retained": retained.__dict__,
                "reset_before_query": reset.__dict__,
                "serialized_restore": restored.__dict__,
                "claim": "retained and restored state must outperform reset state",
            },
        )

    def _evaluate_condition(
        self,
        model: StatefulMemoryModel,
        episodes: list[MemoryEpisode],
        condition: str,
    ) -> MemoryConditionResult:
        correct = 0
        failures: list[dict[str, str]] = []
        for episode in episodes:
            state = model.initial_state()
            _, state = model.step(episode.write_prompt, state)
            _, state = model.step(episode.distractor_prompt, state)
            if condition == "reset_before_query":
                state = model.reset_state(state)
            elif condition == "serialized_restore":
                snapshot = model.snapshot_state(state)
                state = model.load_state(snapshot)
            prediction, _ = model.step(episode.query_prompt, state)
            prediction = prediction.strip()
            if prediction == episode.answer:
                correct += 1
            elif len(failures) < 10:
                failures.append({"query": episode.query_prompt, "expected": episode.answer, "got": prediction})
        total = len(episodes)
        return MemoryConditionResult(condition, correct / max(1, total), correct, total, tuple(failures))


# Default instance used by research runners.
default = PersistentMemoryBenchmark()
