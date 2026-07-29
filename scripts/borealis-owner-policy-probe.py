"""Probe Borealis's owner-policy learning behavior.

DO NOT USE AS A PRODUCTION BENCHMARK YET.

This script asks whether reading the owner-policy teaching stream changes
Borealis's choices on held-out situations. It compares:

* frozen: read teaching packets without updating adaptation state;
* adapted: update run-local output-bias state from teaching packets;
* consolidated: adapt, then fold the adaptation overlay into durable output
  weights before scoring the held-out query.

The model is byte-level, so each answer is scored by the autoregressive log
likelihood of four candidate continuations such as
``CHOICE|slot=2|name=quinoa_bowl``. The default model is freshly initialized;
results demonstrate the probe mechanics, not trained-model capability.
"""

from __future__ import annotations

import argparse
import copy
import math
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import torch

from architectures.borealis.model import Borealis, BorealisAdaptationState, BorealisConfig
from sources.owner_policy_worlds import generate_owner_policy_worlds

OPTION_RE = re.compile(r"^OPTION\|slot=(\d+)\|name=([^|]+)\|", re.MULTILINE)


@dataclass
class ModeResult:
    correct: int = 0
    total: int = 0
    total_nll: float = 0.0

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0

    @property
    def mean_nll(self) -> float:
        return self.total_nll / self.total if self.total else math.nan


def byte_tokens(text: str, vocab_size: int) -> torch.Tensor:
    """Match Borealis's current byte-token encoding convention."""
    values = [byte % vocab_size for byte in text.encode("utf-8")]
    if len(values) < 2:
        values.append(0)
    return torch.tensor(values, dtype=torch.long)


def packet_text(packet: dict[str, Any]) -> str:
    return "\n".join(
        part["text"] for part in packet["parts"] if part["type"] == "text"
    )


def query_candidates(query: str) -> list[tuple[int, str, str]]:
    """Return (slot, action name, candidate continuation) tuples."""
    options = [(int(slot), name) for slot, name in OPTION_RE.findall(query)]
    if len(options) != 4:
        raise ValueError(f"expected four options, found {len(options)} in query")
    return [
        (slot, name, f"\nCHOICE|slot={slot}|name={name}")
        for slot, name in options
    ]


def adapt_on_teaching(
    model: Borealis,
    teaching_packets: list[dict[str, Any]],
    *,
    adapt: bool,
) -> BorealisAdaptationState:
    """Read teaching packets while carrying only run-local adaptation state."""
    adaptation_state = model.initialize_adaptation_state()
    for packet in teaching_packets:
        state = model.prefill(
            byte_tokens(packet_text(packet), model.config.vocab_size),
            adaptation_state=adaptation_state,
            adapt=adapt,
        )
        adaptation_state = state.adaptation_state
    return adaptation_state


def score_candidate(
    model: Borealis,
    query: str,
    adaptation_state: BorealisAdaptationState,
    continuation: str,
) -> float:
    """Score a candidate continuation without updating model state."""
    generation_state = model.prefill(
        byte_tokens(query, model.config.vocab_size),
        adaptation_state=adaptation_state,
        adapt=False,
    )
    total_log_probability = 0.0
    for token_id in byte_tokens(continuation, model.config.vocab_size).tolist():
        logits = model.next_token_logits(generation_state)
        total_log_probability += float(torch.log_softmax(logits, dim=-1)[token_id])
        generation_state = model.advance_generation(
            generation_state,
            torch.tensor(token_id, dtype=torch.long),
        )
    return total_log_probability


def choose_slot(
    model: Borealis,
    record: dict[str, Any],
    adaptation_state: BorealisAdaptationState,
) -> tuple[int, float]:
    query = packet_text(record["inputs"][-1])
    scored = [
        (
            slot,
            score_candidate(model, query, adaptation_state, continuation),
        )
        for slot, _name, continuation in query_candidates(query)
    ]
    return max(scored, key=lambda item: item[1])


def evaluate_mode(
    base_state: dict[str, torch.Tensor],
    config: BorealisConfig,
    records: list[dict[str, Any]],
    mode: str,
) -> ModeResult:
    result = ModeResult()

    with torch.no_grad():
        for record in records:
            # Every episode starts from the same durable revision. Otherwise
            # consolidated mode would accidentally teach later records from
            # earlier records, mixing within-episode learning with across-
            # episode continual learning.
            model = Borealis(config)
            model.load_state_dict(copy.deepcopy(base_state))
            teaching = record["inputs"][:-1]
            if mode == "frozen":
                adaptation_state = adapt_on_teaching(model, teaching, adapt=False)
            elif mode == "adapted":
                adaptation_state = adapt_on_teaching(model, teaching, adapt=True)
            elif mode == "consolidated":
                adaptation_state = adapt_on_teaching(model, teaching, adapt=True)
                adaptation_state = model.consolidate_weights(adaptation_state)
            else:
                raise ValueError(f"unknown mode: {mode}")

            predicted_slot, score = choose_slot(model, record, adaptation_state)
            result.correct += int(predicted_slot == int(record["answerIndex"]))
            result.total += 1
            result.total_nll -= score

    return result


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
    eval_records = [
        record for record in records if record["metadata"]["split"] == "eval"
    ]
    by_owner: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in eval_records:
        by_owner[str(record["metadata"]["ownerId"])].append(record)

    print("Borealis owner-policy probe (DO NOT MERGE)")
    print(f"records={len(eval_records)} owners={len(by_owner)}")
    print("random_baseline=25.00%")
    print()

    modes = ("frozen", "adapted", "consolidated")
    aggregate = {
        mode: evaluate_mode(base_state, config, eval_records, mode)
        for mode in modes
    }

    print("aggregate")
    for mode in modes:
        result = aggregate[mode]
        print(
            f"  {mode:12} accuracy={result.accuracy:7.2%} "
            f"mean_candidate_nll={result.mean_nll:8.3f} "
            f"({result.correct}/{result.total})"
        )

    print()
    print("by_owner")
    for owner_id, owner_records in sorted(by_owner.items()):
        print(f"  {owner_id}")
        for mode in modes:
            result = evaluate_mode(base_state, config, owner_records, mode)
            print(
                f"    {mode:12} accuracy={result.accuracy:7.2%} "
                f"({result.correct}/{result.total})"
            )


if __name__ == "__main__":
    main()
