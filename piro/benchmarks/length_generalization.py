"""
benchmark: length-generalization

Evaluates a trained model's ability to generalize to sequence lengths
beyond the training range. This is the core memory probe for CTM vs
transformer comparison.

Training data: counter-sequences (lengths 2-8, INC/DEC → signed count)
Eval data:     generated on-the-fly at lengths {2, 4, 6, 8, 12, 16, 24, 32, 48}

The benchmark generates N samples per length bucket, runs the model on
each, and reports accuracy stratified by length. A model that truly
learns to count (rather than memorizing patterns) should maintain
accuracy as sequence length grows — this is where CTM's recurrent
tick loop and sync matrix should outperform a fixed-depth transformer.

Usage (invoked by the training/eval pipeline after a model is trained):
    python benchmark.py --model-path /path/to/model.pt --model-class ctm

Output: JSON array of { length, accuracy, n_samples, correct, incorrect }
"""

import argparse
import json
import random
import sys
from dataclasses import dataclass
from typing import List, Tuple


# ── Config ────────────────────────────────────────────────────────────────────

TEST_LENGTHS = [2, 4, 6, 8, 12, 16, 24, 32, 48]
SAMPLES_PER_LENGTH = 500
SEED = 12345  # fixed seed for reproducibility — different from training seed


# ── Sample generation ─────────────────────────────────────────────────────────

@dataclass
class EvalSample:
    prompt: str   # space-joined INC/DEC tokens, e.g. "INC DEC INC INC DEC"
    label: str    # signed integer string, e.g. "+1", "-2", "0"
    length: int   # sequence length


def make_sample(length: int, rng: random.Random) -> EvalSample:
    ops = [rng.choice(["INC", "DEC"]) for _ in range(length)]
    count = sum(1 if op == "INC" else -1 for op in ops)
    if count < 0:
        label = f"-{-count}"
    elif count > 0:
        label = f"+{count}"
    else:
        label = "0"
    return EvalSample(prompt=" ".join(ops), label=label, length=length)


def generate_eval_set(lengths: List[int], n_per_length: int, seed: int) -> List[EvalSample]:
    rng = random.Random(seed)
    samples = []
    for length in lengths:
        for _ in range(n_per_length):
            samples.append(make_sample(length, rng))
    return samples


# ── Scoring ───────────────────────────────────────────────────────────────────

def score_prediction(predicted: str, target: str) -> bool:
    """Exact match on the signed integer label."""
    return predicted.strip() == target.strip()


# ── Main eval loop ────────────────────────────────────────────────────────────

def evaluate(model, lengths: List[int], n_per_length: int, seed: int) -> List[dict]:
    """
    Run the model on generated eval samples and return per-length results.

    Args:
        model: a loaded model with a .generate(prompt: str) -> str method
        lengths: sequence lengths to evaluate
        n_per_length: samples per length bucket
        seed: RNG seed for eval sample generation

    Returns:
        List of { length, accuracy, n_samples, correct, incorrect }
    """
    results = []
    for length in lengths:
        rng = random.Random(seed + length)  # deterministic per length
        correct = 0
        total = 0
        for _ in range(n_per_length):
            sample = make_sample(length, rng)
            prediction = model.generate(sample.prompt)
            if score_prediction(prediction, sample.label):
                correct += 1
            total += 1
        accuracy = correct / total if total > 0 else 0.0
        results.append({
            "length": length,
            "accuracy": accuracy,
            "n_samples": total,
            "correct": correct,
            "incorrect": total - correct,
        })
    return results


# ── CLI entry point (for standalone testing) ──────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Length generalization benchmark")
    parser.add_argument("--model-path", type=str, required=False, help="Path to model checkpoint")
    parser.add_argument("--model-class", type=str, default="ctm", help="Model class (ctm | baseline-transformer)")
    parser.add_argument("--dry-run", action="store_true", help="Generate eval set without a model (for inspection)")
    args = parser.parse_args()

    if args.dry_run:
        samples = generate_eval_set(TEST_LENGTHS, SAMPLES_PER_LENGTH, SEED)
        print(f"Generated {len(samples)} eval samples across {len(TEST_LENGTHS)} length buckets")
        for length in TEST_LENGTHS:
            bucket = [s for s in samples if s.length == length]
            print(f"  length={length:2d}  n={len(bucket)}  example: {bucket[0].prompt} → {bucket[0].label}")
        sys.exit(0)

    # Real evaluation requires a loaded model — stub for now
    print(json.dumps({"error": "Model loading not yet implemented — use --dry-run to inspect eval set"}, indent=2))
    sys.exit(1)
