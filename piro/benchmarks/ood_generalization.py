"""
benchmarks/ood_generalization.py

OOD Generalization benchmark — sorting sequences.

The key question this answers: can the model apply a learned rule
(sort numbers) to sequences significantly longer than it was trained on?

Protocol
--------
1. Generate ``n_train_samples`` sorting problems with sequences of length N
   (train distribution — these are never shown to the model here, just used
   to set the difficulty baseline).
2. Generate ``n_test_samples`` sorting problems with sequences of length 4×N
   (out-of-distribution — the model must generalise beyond its training length).
3. For each test problem, prompt the model with the unsorted sequence and
   check whether its output matches the ground-truth sorted order.
4. Score = fraction of test problems answered correctly.

Why this matters for Piro
--------------------------
GRPO trains on a fixed prompt distribution.  If the student over-fits to
sequence length it will fail here.  A high OOD score signals that the model
learned the *rule* (sort), not just the specific examples it was rewarded on.

Registration
------------
An instance is registered in the module-level REGISTRY so ``run_benchmarks.py``
picks it up automatically on import:

    from piro.benchmarks import ood_generalization  # noqa: F401
"""

from __future__ import annotations

import re
from typing import Any

from .base import Benchmark, BenchmarkResult
from piro.data.sequences import generate_sorting_dataset, SequenceSample

__all__ = ["OODGeneralization"]


# ---------------------------------------------------------------------------
# Helper (kept here for metadata — re-parses model output)
# ---------------------------------------------------------------------------

def _parse_reply(reply: str) -> list[int] | None:
    tokens = re.findall(r"\d+", reply)
    if not tokens:
        return None
    try:
        return [int(t) for t in tokens]
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Benchmark
# ---------------------------------------------------------------------------

class OODGeneralization(Benchmark):
    """
    OOD Generalization via sorting sequences.

    Parameters
    ----------
    train_length:
        Sequence length for the in-distribution (train) regime.
        The test sequences are ``4 * train_length`` elements long.
    n_test_samples:
        Number of test problems to evaluate.  More = more stable score,
        but slower (one model call per sample).
    threshold:
        Minimum fraction correct to pass.  Default 0.5 — a model that
        can't sort correctly at least half the time on OOD inputs is
        not generalising.
    seed:
        RNG seed for reproducible test sets across runs.
    """

    name = "OODGeneralization"
    threshold = 0.5

    def __init__(
        self,
        train_length: int = 5,
        n_test_samples: int = 20,
        seed: int = 42,
    ) -> None:
        self.train_length = train_length
        self.test_length = train_length * 4
        self.n_test_samples = n_test_samples
        self.seed = seed

    def _build_test_set(self) -> list[SequenceSample]:
        """Return reproducible test samples for the OOD (4×N) regime."""
        return generate_sorting_dataset(
            self.n_test_samples,
            length=self.test_length,
            seed=self.seed,
            split="test",
        )

    def run(self, model: Any) -> BenchmarkResult:
        test_set = self._build_test_set()
        correct = 0
        errors: list[str] = []

        for sample in test_set:
            try:
                reply = model.generate(
                    sample.prompt,
                    max_tokens=self.test_length * 6,  # ~5 chars per number + spaces
                    temperature=0.0,
                )
                if sample.is_correct(reply):
                    correct += 1
                elif len(errors) < 3:
                    errors.append(
                        f"expected={list(sample.sorted_sequence[:4])}… "
                        f"got={(_parse_reply(reply) or [])[:4]}…"
                    )
            except Exception as exc:  # noqa: BLE001
                if len(errors) < 3:
                    errors.append(f"error: {exc}")

        score = correct / len(test_set)

        return self.result(
            score,
            baseline_scores={
                "random": 1 / (self.test_length),   # chance of any single position right
            },
            metadata={
                "train_length": self.train_length,
                "test_length": self.test_length,
                "n_samples": len(test_set),
                "n_correct": correct,
                "failure_examples": errors,
            },
        )


# ---------------------------------------------------------------------------
# Register a default instance
# ---------------------------------------------------------------------------

#: Default instance registered for use in run_benchmarks.py
default = OODGeneralization(train_length=5, n_test_samples=20, seed=42)
