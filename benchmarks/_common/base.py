"""
benchmarks/base.py

Abstract base for all Piro capability benchmarks.

Every benchmark measures one thing: can the student model do X at least as well
as the threshold? Benchmarks are run after each GRPO update to guard the
build-not-decay contract — a model that can't pass its previous benchmarks
doesn't ship.

Usage
-----
Subclass Benchmark, implement `run`, and register the instance in the
capability ledger (eval/capability_map.py).

    class MyBenchmark(Benchmark):
        threshold = 0.75

        def run(self, model: Any) -> BenchmarkResult:
            score = ...compute score from 0.0 to 1.0...
            return self.result(score, baseline_scores={"random": 0.25})

The `result()` helper sets `passed = score >= self.threshold` automatically.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class BenchmarkResult:
    """
    Result of a single benchmark run.

    Attributes
    ----------
    score:
        Primary metric, normalised to [0.0, 1.0].
        Higher is always better.
    baseline_scores:
        Reference points for interpreting `score`.
        Typical keys: "random" (chance level), "human" (human ceiling),
        "previous" (last checkpoint score).
    passed:
        True when `score` meets or exceeds the benchmark's threshold.
        The training loop checks this to enforce build-not-decay.
    metadata:
        Arbitrary extra data — prompt counts, per-category breakdowns,
        timing, etc.  Stored in the capability ledger for later analysis.
    duration_s:
        Wall-clock seconds the benchmark took to run.  Populated
        automatically by `Benchmark.run_timed()`.
    """

    score: float
    baseline_scores: dict[str, float]
    passed: bool
    metadata: dict[str, Any] = field(default_factory=dict)
    duration_s: float = 0.0

    def __post_init__(self) -> None:
        if not (0.0 <= self.score <= 1.0):
            raise ValueError(f"score must be in [0, 1], got {self.score}")
        for k, v in self.baseline_scores.items():
            if not (0.0 <= v <= 1.0):
                raise ValueError(f"baseline_scores[{k!r}] must be in [0, 1], got {v}")


class Benchmark(ABC):
    """
    Abstract base class for all Piro benchmarks.

    Subclasses must set `threshold` and implement `run`.

    Attributes
    ----------
    name:
        Human-readable identifier, used in capability ledger keys.
        Defaults to the class name if not overridden.
    threshold:
        Minimum `score` for `passed=True`.  Must be in (0, 1].
        Set conservatively — failing a benchmark blocks a model update.
    """

    name: str = ""
    threshold: float = 0.5

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not cls.name:
            cls.name = cls.__name__
        if not (0.0 < cls.threshold <= 1.0):
            raise ValueError(f"{cls.__name__}.threshold must be in (0, 1], got {cls.threshold}")

    @abstractmethod
    def run(self, model: Any) -> BenchmarkResult:
        """
        Evaluate `model` and return a BenchmarkResult.

        Parameters
        ----------
        model:
            The student model to evaluate.  Type is intentionally `Any` so
            benchmarks can work with raw PyTorch modules, ONNX sessions, or
            API-backed stubs during early research.

        Returns
        -------
        BenchmarkResult
            Use `self.result(score, ...)` to construct it — that helper
            wires up `passed` from `self.threshold` automatically.
        """
        ...

    def run_timed(self, model: Any) -> BenchmarkResult:
        """
        Call `run` and record wall-clock duration in the result.

        Prefer this over calling `run` directly so timing is always captured.
        """
        t0 = time.perf_counter()
        result = self.run(model)
        result.duration_s = time.perf_counter() - t0
        return result

    def result(
        self,
        score: float,
        *,
        baseline_scores: dict[str, float] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> BenchmarkResult:
        """
        Convenience constructor that wires `passed` from `self.threshold`.

        Parameters
        ----------
        score:
            Primary metric in [0, 1].
        baseline_scores:
            Reference scores.  Defaults to an empty dict.
        metadata:
            Extra data to store alongside the result.
        """
        return BenchmarkResult(
            score=score,
            baseline_scores=baseline_scores or {},
            passed=score >= self.threshold,
            metadata=metadata or {},
        )
