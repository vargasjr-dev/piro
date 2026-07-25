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

from architectures._common.encoding import memory_embedding
from benchmarks._common.base import Benchmark, BenchmarkResult
from sources.associative_recall import MemoryEpisode, generate_associative_recall_dataset


class StatefulMemoryModel(Protocol):
    def initial_state(self) -> Any: ...

    def step(self, prompt: str, state: Any) -> tuple[str, Any]: ...

    def reset_state(self, state: Any) -> Any: ...

    def snapshot_state(self, state: Any) -> Any: ...

    def load_state(self, snapshot: Any) -> Any: ...


class CTMStatefulMemoryAdapter:
    """Adapt a ``ContinuousThoughtModel`` to the memory benchmark protocol.

    CTM retains neural state internally, while the benchmark passes explicit
    snapshots between calls so retained, reset, and restored conditions are
    reproducible. This adapter is an execution bridge, not a claim that an
    untrained CTM has learned associative recall.
    """

    def __init__(self, model: Any, *, value_count: int = 32) -> None:
        self.model = model
        self.value_count = value_count
        if getattr(model, "config", None) is not None and model.config.n_classes < value_count:
            raise ValueError("CTM n_classes must be at least value_count")

    def _embedding(self, token: str):
        torch = __import__("torch")
        parameter = next(self.model.parameters())
        return memory_embedding(
            token,
            self.model.embed_dim,
            torch_module=torch,
            dtype=parameter.dtype,
            device=parameter.device,
        )

    def _run(self, prompt: str) -> str:
        answer = ""
        for line in prompt.splitlines():
            observation = line.strip()
            if not observation:
                continue
            if "=" in observation:
                key, value = (part.strip() for part in observation.split("=", maxsplit=1))
                self.model(self._embedding(f"{key}={value}"))
            elif observation.startswith("token_"):
                self.model(self._embedding(observation))
            else:
                output = self.model(self._embedding(f"QUERY:{observation}"))
                logits = output.logits if hasattr(output, "logits") else output
                index = int(logits[: self.value_count].argmax().item())
                answer = f"value_{index:03d}"
        return answer

    def initial_state(self) -> dict[str, Any]:
        self.model.reset()
        return self.model.snapshot_state()

    def step(self, prompt: str, state: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        self.model.load_state(state)
        answer = self._run(prompt)
        return answer, self.model.snapshot_state()

    def reset_state(self, state: dict[str, Any]) -> dict[str, Any]:  # noqa: ARG002
        self.model.reset()
        return self.model.snapshot_state()

    def snapshot_state(self, state: dict[str, Any]) -> dict[str, Any]:
        return _clone_snapshot(state)

    def load_state(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        return _clone_snapshot(snapshot)


def _clone_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Clone tensor-containing CTM snapshots without requiring torch at import time."""
    cloned: dict[str, Any] = {}
    for key, value in snapshot.items():
        if isinstance(value, list):
            cloned[key] = [
                item.detach().clone() if hasattr(item, "detach") else item for item in value
            ]
        elif hasattr(value, "detach"):
            cloned[key] = value.detach().clone()
        elif isinstance(value, dict):
            cloned[key] = _clone_snapshot(value)
        else:
            cloned[key] = value
    return cloned


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
            _, state = model.step(episode.write_observation, state)
            _, state = model.step(episode.distractor_observation, state)
            if condition == "reset_before_query":
                state = model.reset_state(state)
            elif condition == "serialized_restore":
                snapshot = model.snapshot_state(state)
                state = model.load_state(snapshot)
            prediction, _ = model.step(episode.query_observation, state)
            prediction = prediction.strip()
            if prediction == episode.answer:
                correct += 1
            elif len(failures) < 10:
                failures.append(
                    {
                        "query": episode.query_observation,
                        "expected": episode.answer,
                        "got": prediction,
                    }
                )
        total = len(episodes)
        return MemoryConditionResult(
            condition, correct / max(1, total), correct, total, tuple(failures)
        )


# Default instance used by research runners.
default = PersistentMemoryBenchmark()
