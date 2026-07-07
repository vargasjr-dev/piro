"""
benchmarks/adaptive_compute.py

Adaptive Compute benchmark — easy vs. hard arithmetic tasks.

The key question this answers: does the model allocate proportionally more
compute to harder problems?  A model that "thinks harder" on multi-step
reasoning (longer chains, more ticks) and still gets the answer right is
showing genuine adaptive compute behaviour — a core property we want to train.

Protocol
--------
Easy tasks   — single-step arithmetic (e.g. "What is 347 + 829?")
Hard tasks   — chained multi-step arithmetic (e.g. "What is (42 × 17) + (91 − 36)?
               Then multiply that result by 3.")

For each task:
1. Record wall-clock latency (ms) before and after model.generate().
   For GPT models this is the only compute proxy available.
2. For our student model: if it exposes a ``tick_count`` attribute after
   generate(), record that too.  Otherwise fall back to latency.
3. Check whether the numeric answer in the reply matches ground truth.

Score = fraction of all tasks answered correctly.
The compute ratio (hard_latency / easy_latency) is stored in metadata —
a ratio > 1 means the model is spending more time on harder problems.

Why this matters for Piro
--------------------------
RL-trained models can learn to "think more" by generating internal scratchpad
tokens before committing to an answer (chain-of-thought as a learned behaviour,
not a prompted one).  This benchmark detects whether that's happening by
measuring the compute differential between easy and hard tasks.

Registration
------------
A default instance is registered at module level.  Import this module in
run_benchmarks.py to include it automatically:

    from piro.benchmarks import adaptive_compute  # noqa: F401
"""

from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass
from typing import Any

from .base import Benchmark, BenchmarkResult

__all__ = ["AdaptiveCompute"]


# ---------------------------------------------------------------------------
# Task generation
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ArithmeticTask:
    prompt: str
    answer: int        # exact integer answer
    difficulty: str    # "easy" | "hard"


def _make_easy_tasks(n: int, seed: int) -> list[ArithmeticTask]:
    """Single-step addition or subtraction, small operands."""
    rng = random.Random(seed)
    tasks: list[ArithmeticTask] = []
    for _ in range(n):
        a = rng.randint(10, 999)
        b = rng.randint(10, 999)
        op = rng.choice(["+", "-"])
        answer = a + b if op == "+" else a - b
        tasks.append(ArithmeticTask(
            prompt=f"What is {a} {op} {b}? Reply with only the integer answer.",
            answer=answer,
            difficulty="easy",
        ))
    return tasks


def _make_hard_tasks(n: int, seed: int) -> list[ArithmeticTask]:
    """
    Two-stage chained arithmetic:
      Step 1: a × b  (multiplication forces multi-step reasoning)
      Step 2: add/subtract c, then multiply result by d

    Example: "What is (42 × 17) + 91, then multiply that result by 3?"
    → (42 × 17) = 714, 714 + 91 = 805, 805 × 3 = 2415
    """
    rng = random.Random(seed + 9999)  # different stream from easy tasks
    tasks: list[ArithmeticTask] = []
    for _ in range(n):
        a = rng.randint(2, 50)
        b = rng.randint(2, 50)
        c = rng.randint(1, 200)
        d = rng.randint(2, 10)
        op = rng.choice(["+", "-"])
        step1 = a * b
        step2 = step1 + c if op == "+" else step1 - c
        answer = step2 * d
        tasks.append(ArithmeticTask(
            prompt=(
                f"What is ({a} × {b}) {op} {c}? "
                f"Then multiply that result by {d}. "
                "Reply with only the final integer answer."
            ),
            answer=answer,
            difficulty="hard",
        ))
    return tasks


def _parse_answer(reply: str) -> int | None:
    """Extract the first integer (possibly negative) from a reply string."""
    m = re.search(r"-?\d[\d,]*", reply.replace(",", ""))
    if not m:
        return None
    try:
        return int(m.group().replace(",", ""))
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Benchmark
# ---------------------------------------------------------------------------

class AdaptiveCompute(Benchmark):
    """
    Adaptive Compute benchmark.

    Parameters
    ----------
    n_easy:
        Number of easy (single-step) tasks.
    n_hard:
        Number of hard (multi-step) tasks.
    threshold:
        Minimum fraction correct across all tasks.  Default 0.6.
    seed:
        RNG seed for reproducible task sets.
    """

    name = "AdaptiveCompute"
    threshold = 0.6

    def __init__(
        self,
        n_easy: int = 10,
        n_hard: int = 10,
        seed: int = 42,
    ) -> None:
        self.n_easy = n_easy
        self.n_hard = n_hard
        self.seed = seed

    def run(self, model: Any) -> BenchmarkResult:
        easy_tasks = _make_easy_tasks(self.n_easy, self.seed)
        hard_tasks = _make_hard_tasks(self.n_hard, self.seed)
        all_tasks = easy_tasks + hard_tasks

        correct = 0
        easy_correct = 0
        hard_correct = 0
        easy_latencies: list[float] = []
        hard_latencies: list[float] = []
        easy_ticks: list[int] = []
        hard_ticks: list[int] = []
        failures: list[str] = []

        for task in all_tasks:
            try:
                t0 = time.perf_counter()
                reply = model.generate(
                    task.prompt,
                    max_tokens=64,
                    temperature=0.0,
                )
                latency_ms = (time.perf_counter() - t0) * 1000

                # Tick count — our student model may expose this after generate()
                tick_count: int | None = getattr(model, "last_tick_count", None)

                parsed = _parse_answer(reply)
                is_correct = parsed == task.answer

                if is_correct:
                    correct += 1
                    if task.difficulty == "easy":
                        easy_correct += 1
                    else:
                        hard_correct += 1
                elif len(failures) < 3:
                    failures.append(
                        f"[{task.difficulty}] expected={task.answer} got={parsed!r}"
                    )

                if task.difficulty == "easy":
                    easy_latencies.append(latency_ms)
                    if tick_count is not None:
                        easy_ticks.append(tick_count)
                else:
                    hard_latencies.append(latency_ms)
                    if tick_count is not None:
                        hard_ticks.append(tick_count)

            except Exception as exc:  # noqa: BLE001
                if len(failures) < 3:
                    failures.append(f"[{task.difficulty}] error: {exc}")

        score = correct / len(all_tasks) if all_tasks else 0.0

        # Compute ratio: how much more time/ticks does the model spend on hard vs easy?
        avg_easy_lat = sum(easy_latencies) / len(easy_latencies) if easy_latencies else 0.0
        avg_hard_lat = sum(hard_latencies) / len(hard_latencies) if hard_latencies else 0.0
        latency_ratio = avg_hard_lat / avg_easy_lat if avg_easy_lat > 0 else None

        avg_easy_ticks = sum(easy_ticks) / len(easy_ticks) if easy_ticks else None
        avg_hard_ticks = sum(hard_ticks) / len(hard_ticks) if hard_ticks else None
        tick_ratio = (
            avg_hard_ticks / avg_easy_ticks
            if avg_easy_ticks and avg_hard_ticks and avg_easy_ticks > 0
            else None
        )

        metadata: dict[str, Any] = {
            "n_easy": self.n_easy,
            "n_hard": self.n_hard,
            "n_total": len(all_tasks),
            "n_correct": correct,
            "easy_correct": easy_correct,
            "hard_correct": hard_correct,
            "avg_easy_latency_ms": round(avg_easy_lat, 1),
            "avg_hard_latency_ms": round(avg_hard_lat, 1),
            "latency_ratio": round(latency_ratio, 3) if latency_ratio is not None else None,
            "failure_examples": failures,
        }
        if avg_easy_ticks is not None:
            metadata["avg_easy_ticks"] = round(avg_easy_ticks, 1)
            metadata["avg_hard_ticks"] = round(avg_hard_ticks or 0, 1)
            metadata["tick_ratio"] = round(tick_ratio, 3) if tick_ratio is not None else None

        return self.result(
            score,
            baseline_scores={"random": 0.01},  # near-zero chance of guessing exact integer
            metadata=metadata,
        )


# ---------------------------------------------------------------------------
# Register default instance
# ---------------------------------------------------------------------------

#: Default instance registered for use in run_benchmarks.py
default = AdaptiveCompute(n_easy=10, n_hard=10, seed=42)
