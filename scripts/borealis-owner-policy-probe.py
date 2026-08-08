"""Probe Borealis's owner-policy learning behavior.

DO NOT USE AS A PRODUCTION BENCHMARK YET.

This script asks whether reading the owner-policy teaching stream changes
Borealis's choices on held-out situations. It reports:

* a per-example adapted learning curve;
* frozen, adapted, and consolidated final results;
* controls with no teaching, shuffled teaching choices, and another owner's
  teaching stream.

The model is byte-level, so each answer is scored by the autoregressive log
likelihood of four candidate continuations such as
``CHOICE|slot=2|name=quinoa_bowl``. The default model is freshly initialized;
results demonstrate the probe mechanics, not trained-model capability.
"""

from __future__ import annotations

import argparse
import copy
import math
import random
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import torch

from architectures.borealis.model import Borealis, BorealisAdaptationState, BorealisConfig
from sources.owner_policy_worlds import generate_owner_policy_worlds

OPTION_RE = re.compile(r"^OPTION\|slot=(\d+)\|name=([^|]+)\|", re.MULTILINE)
CHOICE_RE = re.compile(r"^CHOICE\|slot=(\d+)\|name=([^|]+)$", re.MULTILINE)
CORRECTION_RE = re.compile(r"^CORRECTION\|.*$", re.MULTILINE)


@dataclass
class CandidateScore:
    slot: int
    name: str
    log_probability: float


@dataclass
class TracePoint:
    prefix_length: int
    correct: bool
    rank: int
    target_log_probability: float
    margin: float
    adaptation_norm: float
    update_norm: float
    updates: int
    loss_ema: float | None


@dataclass
class ModeResult:
    correct: int = 0
    total: int = 0
    total_nll: float = 0.0
    target_log_probability: float = 0.0
    margin: float = 0.0

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0

    @property
    def mean_nll(self) -> float:
        return self.total_nll / self.total if self.total else math.nan

    @property
    def mean_target_log_probability(self) -> float:
        return self.target_log_probability / self.total if self.total else math.nan

    @property
    def mean_margin(self) -> float:
        return self.margin / self.total if self.total else math.nan


# ── Dataset and token helpers ────────────────────────────────────────────────


def byte_tokens(text: str, vocab_size: int) -> torch.Tensor:
    """Match Borealis's current byte-token encoding convention."""
    values = [byte % vocab_size for byte in text.encode("utf-8")]
    if len(values) < 2:
        values.append(0)
    return torch.tensor(values, dtype=torch.long)


def packet_text(packet: dict[str, Any]) -> str:
    return "\n".join(part["text"] for part in packet["parts"] if part["type"] == "text")


def text_packet(text: str) -> dict[str, object]:
    return {"parts": [{"type": "text", "text": text}]}


def query_candidates(query: str) -> list[tuple[int, str, str]]:
    """Return (slot, action name, candidate continuation) tuples."""
    options = [(int(slot), name) for slot, name in OPTION_RE.findall(query)]
    if len(options) != 4:
        raise ValueError(f"expected four options, found {len(options)} in query")
    return [(slot, name, f"\nCHOICE|slot={slot}|name={name}") for slot, name in options]


def shuffled_teaching_packets(
    packets: list[dict[str, Any]],
    *,
    seed: int,
) -> list[dict[str, Any]]:
    """Keep the situations but replace teaching labels with wrong choices."""
    rng = random.Random(seed)
    shuffled: list[dict[str, Any]] = []
    for packet in packets:
        text = packet_text(packet)
        options = [(int(slot), name) for slot, name in OPTION_RE.findall(text)]
        choice = CHOICE_RE.search(text)
        if len(options) != 4 or choice is None:
            shuffled.append(packet)
            continue
        original_slot = int(choice.group(1))
        wrong_options = [option for option in options if option[0] != original_slot]
        wrong_slot, wrong_name = rng.choice(wrong_options)
        text = CHOICE_RE.sub(f"CHOICE|slot={wrong_slot}|name={wrong_name}", text, count=1)
        text = CORRECTION_RE.sub("", text).replace("\n\n", "\n").strip()
        shuffled.append(text_packet(text))
    return shuffled


# ── Borealis execution and scoring ──────────────────────────────────────────


def adapt_on_teaching(
    model: Borealis,
    teaching_packets: list[dict[str, Any]],
    *,
    adapt: bool,
    initial_state: BorealisAdaptationState | None = None,
) -> BorealisAdaptationState:
    """Read teaching packets while carrying only run-local adaptation state."""
    adaptation_state = (initial_state or model.initialize_adaptation_state()).clone()
    with torch.no_grad():
        for packet in teaching_packets:
            state = model.prefill(
                byte_tokens(packet_text(packet), model.config.vocab_size),
                adaptation_state=adaptation_state,
                adapt=adapt,
            )
            adaptation_state = state.adaptation_state
    return adaptation_state


def score_candidates(
    model: Borealis,
    query: str,
    adaptation_state: BorealisAdaptationState,
) -> list[CandidateScore]:
    """Score all candidate continuations by normalized log probability."""
    with torch.no_grad():
        candidates = query_candidates(query)
        query_state = model.prefill(
            byte_tokens(query, model.config.vocab_size),
            adaptation_state=adaptation_state,
            adapt=False,
        )
        scored: list[CandidateScore] = []
        for slot, name, continuation in candidates:
            generation_state = query_state
            token_ids = byte_tokens(continuation, model.config.vocab_size).tolist()
            total_log_probability = 0.0
            for token_id in token_ids:
                logits = model.next_token_logits(generation_state)
                total_log_probability += float(
                    torch.log_softmax(logits, dim=-1)[token_id].detach()
                )
                generation_state = model.advance_generation(
                    generation_state,
                    torch.tensor(token_id, dtype=torch.long),
                )
            scored.append(
                CandidateScore(
                    slot=slot,
                    name=name,
                    log_probability=total_log_probability / len(token_ids),
                )
            )
        return scored


def trace_point(
    model: Borealis,
    record: dict[str, Any],
    adaptation_state: BorealisAdaptationState,
    *,
    prefix_length: int,
    previous_adaptation: torch.Tensor,
) -> TracePoint:
    query = packet_text(record["inputs"][-1])
    scores = sorted(
        score_candidates(model, query, adaptation_state),
        key=lambda candidate: candidate.log_probability,
        reverse=True,
    )
    target_slot = int(record["answerIndex"])
    target_index = next(index for index, candidate in enumerate(scores) if candidate.slot == target_slot)
    target_score = scores[target_index].log_probability
    best_incorrect = max(
        candidate.log_probability
        for candidate in scores
        if candidate.slot != target_slot
    )
    return TracePoint(
        prefix_length=prefix_length,
        correct=target_index == 0,
        rank=target_index + 1,
        target_log_probability=target_score,
        margin=target_score - best_incorrect,
        adaptation_norm=float(torch.linalg.vector_norm(adaptation_state.output_bias)),
        update_norm=float(torch.linalg.vector_norm(adaptation_state.output_bias - previous_adaptation)),
        updates=adaptation_state.updates,
        loss_ema=adaptation_state.loss_ema,
    )


def evaluate_mode(
    base_state: dict[str, torch.Tensor],
    config: BorealisConfig,
    records: list[dict[str, Any]],
    mode: str,
    *,
    teaching_override: dict[str, list[dict[str, Any]]] | None = None,
) -> ModeResult:
    result = ModeResult()
    with torch.no_grad():
        for record in records:
            model = Borealis(config)
            model.load_state_dict(copy.deepcopy(base_state))
            owner_id = str(record["metadata"]["ownerId"])
            teaching = (
                teaching_override[owner_id]
                if teaching_override is not None
                else record["inputs"][:-1]
            )
            if mode == "frozen":
                adaptation_state = adapt_on_teaching(model, teaching, adapt=False)
            elif mode in {"adapted", "consolidated"}:
                adaptation_state = adapt_on_teaching(model, teaching, adapt=True)
                if mode == "consolidated":
                    adaptation_state = model.consolidate_weights(adaptation_state)
            elif mode == "none":
                adaptation_state = model.initialize_adaptation_state()
            else:
                raise ValueError(f"unknown mode: {mode}")

            query = packet_text(record["inputs"][-1])
            scores = sorted(
                score_candidates(model, query, adaptation_state),
                key=lambda candidate: candidate.log_probability,
                reverse=True,
            )
            target_slot = int(record["answerIndex"])
            target_index = next(index for index, candidate in enumerate(scores) if candidate.slot == target_slot)
            target_score = scores[target_index].log_probability
            best_incorrect = max(
                candidate.log_probability
                for candidate in scores
                if candidate.slot != target_slot
            )
            result.correct += int(target_index == 0)
            result.total += 1
            result.total_nll -= target_score
            result.target_log_probability += target_score
            result.margin += target_score - best_incorrect
    return result


def adapted_trace(
    base_state: dict[str, torch.Tensor],
    config: BorealisConfig,
    record: dict[str, Any],
    teaching_packets: list[dict[str, Any]],
) -> list[TracePoint]:
    model = Borealis(config)
    model.load_state_dict(copy.deepcopy(base_state))
    adaptation_state = model.initialize_adaptation_state()
    trace: list[TracePoint] = []
    previous_adaptation = adaptation_state.output_bias.detach().clone()
    for prefix_length in range(len(teaching_packets) + 1):
        if prefix_length:
            adaptation_state = adapt_on_teaching(
                model,
                teaching_packets[prefix_length - 1 : prefix_length],
                adapt=True,
                initial_state=adaptation_state,
            )
        trace.append(
            trace_point(
                model,
                record,
                adaptation_state,
                prefix_length=prefix_length,
                previous_adaptation=previous_adaptation,
            )
        )
        previous_adaptation = adaptation_state.output_bias.detach().clone()
    return trace


def print_learning_curve(
    traces: list[list[TracePoint]],
    *,
    label: str,
) -> None:
    print(label)
    print("  prefix  accuracy  mean_rank  target_logp  margin  bias_norm  update_norm")
    for prefix_length in range(len(traces[0])):
        points = [trace[prefix_length] for trace in traces]
        accuracy = sum(point.correct for point in points) / len(points)
        mean_rank = sum(point.rank for point in points) / len(points)
        target_logp = sum(point.target_log_probability for point in points) / len(points)
        margin = sum(point.margin for point in points) / len(points)
        bias_norm = sum(point.adaptation_norm for point in points) / len(points)
        update_norm = sum(point.update_norm for point in points) / len(points)
        print(
            f"  {prefix_length:6d}  {accuracy:8.2%}  {mean_rank:9.3f} "
            f"{target_logp:11.4f}  {margin:6.4f}  {bias_norm:9.4f}  {update_norm:10.4f}"
        )


def print_result(label: str, result: ModeResult) -> None:
    print(
        f"  {label:18} accuracy={result.accuracy:7.2%} "
        f"mean_ranked_target_nll={result.mean_nll:8.4f} "
        f"target_logp={result.mean_target_log_probability:8.4f} "
        f"margin={result.mean_margin:8.4f} ({result.correct}/{result.total})"
    )


# ── CLI ──────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--eval-per-owner", type=int, default=8)
    parser.add_argument("--teaching-examples", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--model-seed", type=int, default=7)
    args = parser.parse_args()

    torch.manual_seed(args.model_seed)
    config = BorealisConfig(
        vocab_size=256,
        embed_dim=32,
        context_dim=64,
        adaptation_learning_rate=0.1,
        consolidation_rate=0.25,
    )
    base_model = Borealis(config)
    base_state = copy.deepcopy(base_model.state_dict())

    records = generate_owner_policy_worlds(
        train_per_owner=1,
        eval_per_owner=args.eval_per_owner,
        teaching_examples=args.teaching_examples,
        seed=args.seed,
    )
    eval_records = [record for record in records if record["metadata"]["split"] == "eval"]
    by_owner: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in eval_records:
        by_owner[str(record["metadata"]["ownerId"])].append(record)
    print("Borealis owner-policy probe (DO NOT MERGE)")
    print(f"records={len(eval_records)} owners={len(by_owner)}")
    print("random_baseline=25.00%")
    print()

    traces = [
        adapted_trace(base_state, config, record, record["inputs"][:-1])
        for record in eval_records
    ]
    print_learning_curve(traces, label="correct-owner adapted learning curve")
    print()

    teaching_by_owner = {
        owner: owner_records[0]["inputs"][:-1]
        for owner, owner_records in by_owner.items()
    }
    shuffled_packets = {
        owner: shuffled_teaching_packets(packets, seed=args.seed + index)
        for index, (owner, packets) in enumerate(sorted(teaching_by_owner.items()))
    }
    shuffled_result = evaluate_mode(
        base_state,
        config,
        eval_records,
        "adapted",
        teaching_override=shuffled_packets,
    )

    other_owner_packets: dict[str, list[dict[str, Any]]] = {}
    owners = sorted(teaching_by_owner)
    for index, owner in enumerate(owners):
        other_owner = owners[(index + 1) % len(owners)]
        other_owner_packets[owner] = teaching_by_owner[other_owner]
    other_owner_result = evaluate_mode(
        base_state,
        config,
        eval_records,
        "adapted",
        teaching_override=other_owner_packets,
    )

    print("final comparison on all held-out records")
    for mode in ("none", "frozen", "adapted", "consolidated"):
        print_result(mode, evaluate_mode(base_state, config, eval_records, mode))
    print_result("shuffled-choice control", shuffled_result)
    print_result("other-owner control", other_owner_result)


if __name__ == "__main__":
    main()
