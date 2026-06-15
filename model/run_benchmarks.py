"""
run_benchmarks.py

Runs all registered benchmarks against three targets:
  1. gpt-4o-mini  — weakest GPT baseline
  2. gpt-4o       — strongest GPT baseline
  3. piro-student — our model (stub returning random scores until implemented)

Prints a formatted score table to stdout and saves results to
model/results/latest.json (also time-stamped copy in model/results/).

Usage
-----
    # From repo root:
    python model/run_benchmarks.py

    # Dry run (skips live API calls, uses random stub for all targets):
    python model/run_benchmarks.py --dry-run

    # Run only specific benchmarks by name:
    python model/run_benchmarks.py --only SanityCheck

Environment variables
---------------------
OPENAI_API_KEY   Required for GPT baselines (skipped automatically in --dry-run)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Resolve project root so this script works when called from any cwd
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent
RESULTS_DIR = ROOT / "results"
RESULTS_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(ROOT.parent))  # make `model` importable as a package

from model.benchmarks.base import Benchmark, BenchmarkResult  # noqa: E402
from model.benchmarks.models import GPTBaseline, ModelProtocol  # noqa: E402


# ---------------------------------------------------------------------------
# Student model stub
# Replaced with the real model once model/architecture/student.py exists.
# ---------------------------------------------------------------------------

class _RandomStub:
    """
    Placeholder student model.

    Returns a deterministic-ish random score per prompt so the pipeline runs
    end-to-end without GPU or trained weights.  Seeded from the prompt text
    for reproducibility within a single run.
    """

    model_name = "piro-student (stub)"

    def generate(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        temperature: float = 0.2,
        system: str | None = None,
    ) -> str:
        rng = random.Random(hash(prompt) & 0xFFFFFFFF)
        words = ["the", "a", "is", "to", "of", "and", "in", "that", "it", "with"]
        return " ".join(rng.choice(words) for _ in range(rng.randint(4, 12)))


# ---------------------------------------------------------------------------
# Benchmark registry
# Concrete benchmarks import this list and append themselves, or are
# registered here directly.  Order determines table row order.
# ---------------------------------------------------------------------------

REGISTRY: list[Benchmark] = []


def register(b: Benchmark) -> Benchmark:
    """Register a Benchmark instance. Used as a decorator or plain call."""
    REGISTRY.append(b)
    return b


# ---------------------------------------------------------------------------
# Built-in sanity-check benchmark
# A trivially easy task — every reasonable model should pass.
# Useful to confirm the pipeline is wired up correctly.
# ---------------------------------------------------------------------------

class _SanityCheck(Benchmark):
    """
    Sanity check: does the model return a non-empty string?

    Threshold is intentionally low (0.1) — this should never fail for a
    real model.  If it does, something is broken in the benchmark harness
    itself.
    """

    name = "SanityCheck"
    threshold = 0.1

    def run(self, model: Any) -> BenchmarkResult:
        prompt = "Reply with the single word: hello"
        try:
            reply = model.generate(prompt, max_tokens=16, temperature=0.0)
            score = 1.0 if reply.strip() else 0.0
        except Exception as exc:  # noqa: BLE001
            return self.result(0.0, metadata={"error": str(exc)})

        return self.result(
            score,
            baseline_scores={"random": 0.5},
            metadata={"reply": reply[:120]},
        )


register(_SanityCheck())


# ---------------------------------------------------------------------------
# Dry-run stub — wraps any model and always returns a short fixed string
# ---------------------------------------------------------------------------

class _DryRunWrapper:
    def __init__(self, inner: Any) -> None:
        self._inner = inner
        self.model_name = f"{inner.model_name} [dry-run]"

    def generate(self, prompt: str, **kwargs: Any) -> str:  # noqa: ARG002
        return "dry run response"


# ---------------------------------------------------------------------------
# Run helpers
# ---------------------------------------------------------------------------

def _run_all(
    model: Any,
    benchmarks: list[Benchmark],
) -> list[dict[str, Any]]:
    rows = []
    for bench in benchmarks:
        result = bench.run_timed(model)
        rows.append(
            {
                "benchmark": bench.name,
                "threshold": bench.threshold,
                "score": round(result.score, 4),
                "passed": result.passed,
                "duration_s": round(result.duration_s, 3),
                "baseline_scores": result.baseline_scores,
                "metadata": result.metadata,
            }
        )
    return rows


def _print_table(targets: list[tuple[str, list[dict[str, Any]]]]) -> None:
    """Pretty-print a score table to stdout."""
    # Collect benchmark names
    bench_names = [r["benchmark"] for r in targets[0][1]]
    target_names = [name for name, _ in targets]

    col_w = max(len(n) for n in bench_names + ["Benchmark"]) + 2
    score_w = max(max(len(n) for n in target_names), 10) + 2

    # Header
    header = f"{'Benchmark':<{col_w}}" + "".join(
        f"{n:>{score_w}}" for n in target_names
    )
    sep = "─" * len(header)
    print()
    print(sep)
    print(header)
    print(sep)

    for i, bench_name in enumerate(bench_names):
        row = f"{bench_name:<{col_w}}"
        for _, results in targets:
            r = results[i]
            mark = "✓" if r["passed"] else "✗"
            cell = f"{mark} {r['score']:.3f}"
            row += f"{cell:>{score_w}}"
        print(row)

    print(sep)

    # Summary: pass counts
    print()
    for name, results in targets:
        passed = sum(1 for r in results if r["passed"])
        total = len(results)
        print(f"  {name}: {passed}/{total} passed")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Run Piro capability benchmarks")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip live API calls — use random stub for all targets",
    )
    parser.add_argument(
        "--benchmark",
        metavar="NAME",
        help="Run only the benchmark with this name (e.g. --benchmark SanityCheck)",
    )
    # --only is a deprecated alias for --benchmark kept for backward compat
    parser.add_argument("--only", metavar="NAME", help=argparse.SUPPRESS)
    parser.add_argument(
        "--model",
        metavar="TARGET",
        choices=["gpt-4o-mini", "gpt-4o", "piro-student"],
        help="Run against a single target: gpt-4o-mini | gpt-4o | piro-student",
    )
    args = parser.parse_args()

    filter_name = args.benchmark or args.only
    benchmarks = (
        [b for b in REGISTRY if b.name == filter_name]
        if filter_name
        else list(REGISTRY)
    )
    if not benchmarks:
        print(f"No benchmarks found{f' named {filter_name!r}' if filter_name else ''}.")
        sys.exit(1)

    stub = _RandomStub()

    all_targets: list[tuple[str, Any]] = (
        [
            ("gpt-4o-mini", _DryRunWrapper(GPTBaseline("gpt-4o-mini"))),
            ("gpt-4o", _DryRunWrapper(GPTBaseline("gpt-4o"))),
            ("piro-student", _DryRunWrapper(stub)),
        ]
        if args.dry_run
        else [
            ("gpt-4o-mini", GPTBaseline("gpt-4o-mini")),
            ("gpt-4o", GPTBaseline("gpt-4o")),
            ("piro-student", stub),
        ]
    )

    if args.model:
        targets: list[tuple[str, Any]] = [
            (label, model) for label, model in all_targets if label == args.model
        ]
    else:
        targets = all_targets

    print(f"Running {len(benchmarks)} benchmark(s) against {len(targets)} target(s)…")

    all_results: dict[str, Any] = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "targets": {},
    }

    target_rows: list[tuple[str, list[dict[str, Any]]]] = []
    for label, model in targets:
        print(f"  → {model.model_name}")
        rows = _run_all(model, benchmarks)
        all_results["targets"][label] = rows
        target_rows.append((label, rows))

    _print_table(target_rows)

    # Save results
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stamped = RESULTS_DIR / f"{ts}.json"
    latest = RESULTS_DIR / "latest.json"

    payload = json.dumps(all_results, indent=2)
    stamped.write_text(payload)
    latest.write_text(payload)

    print(f"Results saved to {latest.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
