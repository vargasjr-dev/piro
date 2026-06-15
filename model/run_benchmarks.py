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
    python model/run_benchmarks.py --benchmark SanityCheck

    # POST results to the Piro web app after running:
    python model/run_benchmarks.py --post-url https://piro-henna.vercel.app --post-token <session-token>

Environment variables
---------------------
OPENAI_API_KEY   Required for GPT baselines (skipped automatically in --dry-run)
PIRO_POST_URL    Default base URL for --post-url (overridden by flag)
PIRO_POST_TOKEN  Default session token for --post-token (overridden by flag)
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
from model.benchmarks.ood_generalization import default as _ood_default  # noqa: E402


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
register(_ood_default)


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
    bench_names = [r["benchmark"] for r in targets[0][1]]
    target_names = [name for name, _ in targets]

    col_w = max(len(n) for n in bench_names + ["Benchmark"]) + 2
    score_w = max(max(len(n) for n in target_names), 10) + 2

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


def _print_details(targets: list[tuple[str, list[dict[str, Any]]]]) -> None:
    """
    Print a per-benchmark detail block after the main score table.

    Surfaces metadata fields that are too verbose for the table:
      - OODGeneralization: accuracy at 4×N, sample count, example failures
      - Any benchmark: non-empty metadata is shown as key: value pairs
    """
    bench_names = [r["benchmark"] for r in targets[0][1]]

    for i, bench_name in enumerate(bench_names):
        # Collect per-target rows for this benchmark
        per_target = [(label, rows[i]) for label, rows in targets]

        # Only print a detail block if at least one target has non-trivial metadata
        has_detail = any(
            r["metadata"] and r["metadata"] != {}
            for _, r in per_target
        )
        if not has_detail:
            continue

        print(f"  ── {bench_name} ──")

        for label, r in per_target:
            meta = r["metadata"]
            if not meta:
                continue

            # OODGeneralization-specific fields
            if "test_length" in meta:
                n_samples = meta.get("n_samples", "?")
                n_correct = meta.get("n_correct", "?")
                test_len = meta.get("test_length", "?")
                train_len = meta.get("train_length", "?")
                acc = f"{n_correct}/{n_samples}"
                print(
                    f"    {label:<16}"
                    f"  accuracy at {test_len} (4×{train_len}): {acc}"
                    f"  ({r['score']:.1%})"
                )
                failures = meta.get("failure_examples", [])
                for fail in failures:
                    print(f"      ✗ {fail}")
            else:
                # Generic: show all metadata as key: value
                kv = ", ".join(f"{k}={v!r}" for k, v in meta.items() if k != "reply")
                if kv:
                    print(f"    {label:<16}  {kv}")
                reply = meta.get("reply")
                if reply:
                    print(f"    {label:<16}  reply={reply!r}")

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
    parser.add_argument(
        "--post-url",
        metavar="URL",
        default=os.environ.get("PIRO_POST_URL"),
        help="Base URL of the Piro web app — results are POSTed to <URL>/api/benchmark-runs",
    )
    parser.add_argument(
        "--post-token",
        metavar="TOKEN",
        default=os.environ.get("PIRO_POST_TOKEN"),
        help="better-auth session token (value of 'better-auth.session_token' cookie)",
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
    _print_details(target_rows)

    # Save results
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stamped = RESULTS_DIR / f"{ts}.json"
    latest = RESULTS_DIR / "latest.json"

    payload = json.dumps(all_results, indent=2)
    stamped.write_text(payload)
    latest.write_text(payload)

    print(f"Results saved to {latest.relative_to(ROOT.parent)}")

    # ── Optional: POST results to Piro web app ────────────────────────────────
    if args.post_url and args.post_token:
        _post_results(
            base_url=args.post_url.rstrip("/"),
            token=args.post_token,
            suite_run_id=ts,
            ran_at=all_results["run_at"],
            target_rows=target_rows,
            benchmarks=benchmarks,
        )
    elif args.post_url and not args.post_token:
        print("⚠  --post-url set but --post-token missing — skipping POST")


def _post_results(
    base_url: str,
    token: str,
    suite_run_id: str,
    ran_at: str,
    target_rows: list[tuple[str, list[dict[str, Any]]]],
    benchmarks: list[Benchmark],
) -> None:
    """POST benchmark results to /api/benchmark-runs on the Piro web app."""
    # Flatten target_rows into a list of result dicts
    threshold_map = {b.name: b.threshold for b in benchmarks}

    results: list[dict[str, Any]] = []
    for target_label, rows in target_rows:
        for row in rows:
            results.append(
                {
                    "benchmarkName": row["benchmark"],
                    "target": target_label,
                    "score": row["score"],
                    "threshold": threshold_map.get(row["benchmark"], row["threshold"]),
                    "passed": row["passed"],
                    "durationMs": int(row["duration_s"] * 1000),
                    "metadata": row["metadata"],
                }
            )

    payload = json.dumps(
        {"suiteRunId": suite_run_id, "ranAt": ran_at, "results": results}
    ).encode()

    req = urllib.request.Request(
        f"{base_url}/api/benchmark-runs",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Cookie": f"better-auth.session_token={token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
        print(f"✓ Posted {body.get('inserted', '?')} result(s) to {base_url}")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠  Failed to POST results: {exc}")


if __name__ == "__main__":
    main()
