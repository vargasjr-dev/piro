"""Compositional owner-policy episodes for Piro's 20K North Star probe.

The dataset is deliberately structured rather than natural-language-heavy. Each
record presents a history of owner choices and corrections, followed by a novel
situation with four candidate actions. The answer requires composing constraints,
relations, context, and priorities; it is not a random key/value lookup.
"""

from __future__ import annotations

import argparse
import itertools
import json
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Action:
    name: str
    ingredients: tuple[str, ...]
    speed: int
    cost: int
    quality: int


@dataclass(frozen=True)
class OwnerPolicy:
    owner_id: str
    forbidden_classes: tuple[str, ...]
    priorities: tuple[str, ...]


@dataclass(frozen=True)
class PolicyCase:
    candidates: tuple[Action, ...]
    deadline: str
    budget: str


ACTIONS: tuple[Action, ...] = (
    Action("oat_wrap", ("oat",), speed=4, cost=2, quality=2),
    Action("cheese_wrap", ("whey",), speed=4, cost=1, quality=3),
    Action("hummus_bowl", ("chickpea",), speed=2, cost=2, quality=3),
    Action("protein_bar", ("whey", "peanut"), speed=5, cost=1, quality=1),
    Action("fruit_salad", ("apple",), speed=2, cost=3, quality=1),
    Action("bean_bowl", ("chickpea",), speed=1, cost=1, quality=3),
    Action("granola", ("whey", "oat"), speed=3, cost=2, quality=2),
    Action("rice_bowl", ("rice",), speed=1, cost=2, quality=3),
    Action("lentil_wrap", ("lentil",), speed=3, cost=2, quality=3),
    Action("almond_bar", ("almond",), speed=5, cost=1, quality=2),
    Action("tofu_bowl", ("soy",), speed=2, cost=2, quality=4),
    Action("milkshake", ("casein",), speed=4, cost=2, quality=4),
    Action("trail_mix", ("peanut", "oat"), speed=3, cost=1, quality=2),
    Action("quinoa_bowl", ("quinoa",), speed=1, cost=3, quality=4),
    Action("banana_oats", ("banana", "oat"), speed=3, cost=1, quality=2),
    Action("vegetable_soup", ("vegetable",), speed=2, cost=1, quality=3),
)

POLICIES: tuple[OwnerPolicy, ...] = (
    OwnerPolicy("safety_speed", ("dairy_protein", "peanut"), ("speed", "quality", "cost")),
    OwnerPolicy("safety_budget", ("dairy_protein", "peanut"), ("cost", "quality", "speed")),
    OwnerPolicy("quality_safety", ("dairy_protein",), ("quality", "speed", "cost")),
    OwnerPolicy("quality_budget", ("peanut",), ("quality", "cost", "speed")),
    OwnerPolicy("budget_speed", ("peanut",), ("cost", "speed", "quality")),
    OwnerPolicy("speed_budget", (), ("speed", "cost", "quality")),
    OwnerPolicy("quality_speed", (), ("quality", "speed", "cost")),
    OwnerPolicy("budget_quality", (), ("cost", "quality", "speed")),
)

INGREDIENT_CLASSES = {
    "whey": "dairy_protein",
    "casein": "dairy_protein",
    "oat": "grain",
    "chickpea": "legume",
    "lentil": "legume",
    "apple": "fruit",
    "banana": "fruit",
    "rice": "grain",
    "quinoa": "grain",
    "peanut": "peanut",
    "almond": "tree_nut",
    "soy": "soy",
    "vegetable": "vegetable",
}

PRIORITIES = ("speed", "cost", "quality")
CONTEXTS = tuple(itertools.product(("urgent", "normal"), ("tight", "normal")))


def _text_input(text: str) -> dict[str, object]:
    return {"parts": [{"type": "text", "text": text}]}


def _active_priorities(policy: OwnerPolicy, *, deadline: str, budget: str) -> tuple[str, ...]:
    priorities = list(policy.priorities)
    if deadline == "urgent":
        priorities.remove("speed")
        priorities.insert(0, "speed")
    if budget == "tight":
        priorities.remove("cost")
        priorities.insert(0, "cost")
    return tuple(priorities)


def _eligible_actions(
    policy: OwnerPolicy, candidates: tuple[Action, ...]
) -> list[tuple[int, Action]]:
    eligible: list[tuple[int, Action]] = []
    for index, action in enumerate(candidates):
        classes = {INGREDIENT_CLASSES[ingredient] for ingredient in action.ingredients}
        if not classes.intersection(policy.forbidden_classes):
            eligible.append((index, action))
    return eligible or list(enumerate(candidates))


def choose_action(
    policy: OwnerPolicy,
    candidates: tuple[Action, ...],
    *,
    deadline: str,
    budget: str,
) -> int:
    """Return the selected option slot under an owner's relational policy."""
    priorities = _active_priorities(policy, deadline=deadline, budget=budget)
    eligible = _eligible_actions(policy, candidates)
    values = {
        "speed": lambda action: action.speed,
        "cost": lambda action: -action.cost,
        "quality": lambda action: action.quality,
    }
    return max(eligible, key=lambda item: tuple(values[name](item[1]) for name in priorities))[0]


def _option_line(slot: int, action: Action) -> str:
    classes = ",".join(
        sorted({INGREDIENT_CLASSES[ingredient] for ingredient in action.ingredients})
    )
    return (
        f"OPTION|slot={slot}|name={action.name}|ingredients={','.join(action.ingredients)}|"
        f"classes={classes}|speed={action.speed}|cost={action.cost}|quality={action.quality}"
    )


def _case_packet(
    case: PolicyCase, *, choice: int | None = None, feedback: str | None = None
) -> str:
    lines = [f"SITUATION|deadline={case.deadline}|budget={case.budget}"]
    lines.extend(_option_line(slot, action) for slot, action in enumerate(case.candidates))
    if choice is not None:
        lines.append(f"CHOICE|slot={choice}|name={case.candidates[choice].name}")
    if feedback is not None:
        lines.append(feedback)
    return "\n".join(lines)


def _feedback(policy: OwnerPolicy, case: PolicyCase, choice: int) -> str:
    action = case.candidates[choice]
    classes = {INGREDIENT_CLASSES[ingredient] for ingredient in action.ingredients}
    forbidden = classes.intersection(policy.forbidden_classes)
    if forbidden:
        return f"CORRECTION|reject|class={sorted(forbidden)[0]}"
    priority = _active_priorities(policy, deadline=case.deadline, budget=case.budget)[0]
    return f"CORRECTION|prefer|attribute={priority}"


def _case_signature(case: PolicyCase) -> tuple[object, ...]:
    return (
        tuple(action.name for action in case.candidates),
        case.deadline,
        case.budget,
    )


def _case_pool(count: int, *, seed: int) -> list[PolicyCase]:
    combinations = list(itertools.combinations(ACTIONS, 4))
    cases = [
        PolicyCase(tuple(candidates), deadline, budget)
        for candidates in combinations
        for deadline, budget in CONTEXTS
    ]
    if count > len(cases):
        raise ValueError(
            f"requested {count} cases but only {len(cases)} unique compositions are available"
        )
    random.Random(seed).shuffle(cases)
    return cases[:count]


def _teaching_stream(policy: OwnerPolicy, *, count: int, seed: int) -> tuple[str, ...]:
    cases = _case_pool(count, seed=seed)
    packets: list[str] = []
    for index, case in enumerate(cases):
        choice = choose_action(policy, case.candidates, deadline=case.deadline, budget=case.budget)
        feedback = _feedback(policy, case, choice) if index % 2 == 0 else None
        packets.append(_case_packet(case, choice=choice, feedback=feedback))
    return tuple(packets)


def _record(
    policy: OwnerPolicy,
    case: PolicyCase,
    teaching: tuple[str, ...],
    *,
    index: int,
    split: str,
) -> dict[str, object]:
    answer_index = choose_action(
        policy,
        case.candidates,
        deadline=case.deadline,
        budget=case.budget,
    )
    query = _case_packet(case)
    return {
        "inputs": [_text_input(packet) for packet in (*teaching, query)],
        "answer": case.candidates[answer_index].name,
        "answerIndex": answer_index,
        "metadata": {
            "benchmark": "owner-policy-worlds",
            "ownerId": policy.owner_id,
            "split": split,
            "index": index,
            "teachingCount": len(teaching),
            "candidateCount": len(case.candidates),
            "deadline": case.deadline,
            "budget": case.budget,
            "randomBaseline": 0.25,
        },
    }


def generate_owner_policy_worlds(
    *,
    train_per_owner: int = 1_000,
    eval_per_owner: int = 250,
    teaching_examples: int = 32,
    seed: int = 42,
) -> list[dict[str, object]]:
    """Generate 8,000 training and 2,000 evaluation episodes by default.

    All owners receive the same held-out situation compositions, so paired
    owner comparisons are meaningful. Training and evaluation compositions are
    disjoint per owner. The generated records are ordered with training first
    because the current Modal trainer derives its 80/20 holdout from JSONL.
    """
    if train_per_owner < 1 or eval_per_owner < 1 or teaching_examples < 1:
        raise ValueError("dataset counts must be positive")
    case_count = train_per_owner + eval_per_owner
    cases = _case_pool(case_count, seed=seed)
    records: list[dict[str, object]] = []
    index = 0
    for split, split_cases in (
        ("train", cases[:train_per_owner]),
        ("eval", cases[train_per_owner:]),
    ):
        for policy_index, policy in enumerate(POLICIES):
            teaching = _teaching_stream(
                policy,
                count=teaching_examples,
                seed=seed + 100_000 + policy_index * 1_000_003,
            )
            for case in split_cases:
                records.append(_record(policy, case, teaching, index=index, split=split))
                index += 1
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate compositional owner-policy episodes")
    parser.add_argument("--train-per-owner", type=int, default=1_000)
    parser.add_argument("--eval-per-owner", type=int, default=250)
    parser.add_argument("--teaching-examples", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    for record in generate_owner_policy_worlds(
        train_per_owner=args.train_per_owner,
        eval_per_owner=args.eval_per_owner,
        teaching_examples=args.teaching_examples,
        seed=args.seed,
    ):
        print(json.dumps(record, separators=(",", ":")))


if __name__ == "__main__":
    main()
