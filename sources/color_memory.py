"""Small episodic color-memory benchmark.

Each episode assigns one color to one or more unique people, then asks for the
color of one person at the end. The public record keeps assignments and query
as ordered PiroInput packets; the answer is stored outside the inputs.

The default dataset has 20 training episodes and 5 held-out evaluation
episodes. Person names are globally unique so success cannot come from
memorizing a name's color across episodes.
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass

COLORS: tuple[str, ...] = ("red", "blue", "yellow", "green")
PERSON_NAMES: tuple[str, ...] = (
    "alice",
    "bruno",
    "carmen",
    "diego",
    "elena",
    "farah",
    "gabriel",
    "hana",
    "ivan",
    "julia",
    "kai",
    "lena",
    "marco",
    "nora",
    "oscar",
    "priya",
    "quinn",
    "rosa",
    "samir",
    "talia",
    "uma",
    "victor",
    "wendy",
    "xavier",
    "yasmin",
    "zane",
    "amelia",
    "ben",
    "celia",
    "dev",
    "erin",
    "felix",
    "grace",
    "hugo",
    "iris",
    "jonah",
    "keira",
    "leo",
    "maya",
    "noah",
    "olivia",
    "pavel",
    "riley",
    "sofia",
    "theo",
    "ursula",
    "violet",
    "will",
    "ximena",
    "yusuf",
    "zoe",
    "aaron",
    "bianca",
    "chris",
    "daphne",
    "emil",
    "freya",
    "george",
    "helena",
    "isabel",
    "jack",
    "kira",
    "liam",
    "monica",
    "niko",
    "opal",
    "penny",
    "rafael",
    "sasha",
    "tomas",
    "valeria",
    "warren",
    "yara",
    "zach",
)


@dataclass(frozen=True)
class ColorMemoryEpisode:
    """One ordered assignment/query episode."""

    assignments: tuple[tuple[str, str], ...]
    target_person: str
    answer: str
    split: str
    index: int

    @property
    def inputs(self) -> tuple[dict[str, object], ...]:
        packets = [
            _text_input(f"{person} = {color}")
            for person, color in self.assignments
        ]
        packets.append(_text_input(f"{self.target_person}?"))
        return tuple(packets)

    def as_json(self) -> dict[str, object]:
        return {
            "inputs": list(self.inputs),
            "answer": self.answer,
            "metadata": {
                "benchmark": "color-memory",
                "split": self.split,
                "index": self.index,
                "assignmentCount": len(self.assignments),
                "targetPerson": self.target_person,
            },
        }


def _text_input(text: str) -> dict[str, object]:
    return {"parts": [{"type": "text", "text": text}]}


def generate_color_memory_dataset(
    *,
    train_count: int = 20,
    test_count: int = 5,
    seed: int = 42,
) -> list[ColorMemoryEpisode]:
    """Generate deterministic episodes with globally unique person names."""
    if train_count < 0 or test_count < 0:
        raise ValueError("train_count and test_count must be non-negative")
    total = train_count + test_count
    if total == 0:
        return []

    rng = random.Random(seed)
    names = list(PERSON_NAMES)
    rng.shuffle(names)
    episodes: list[ColorMemoryEpisode] = []
    name_index = 0

    for index in range(total):
        assignment_count = 1 + index % 3
        episode_names = names[name_index : name_index + assignment_count]
        name_index += assignment_count
        if len(episode_names) != assignment_count:
            raise ValueError("not enough unique person names for requested dataset")

        assignments = tuple(
            (person, rng.choice(COLORS)) for person in episode_names
        )
        target_position = rng.randrange(assignment_count)
        target_person, answer = assignments[target_position]
        split = "train" if index < train_count else "eval"
        episodes.append(
            ColorMemoryEpisode(
                assignments=assignments,
                target_person=target_person,
                answer=answer,
                split=split,
                index=index,
            )
        )

    return episodes


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate color-memory episodes as JSONL")
    parser.add_argument("--train-count", type=int, default=20)
    parser.add_argument("--test-count", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    for episode in generate_color_memory_dataset(
        train_count=args.train_count,
        test_count=args.test_count,
        seed=args.seed,
    ):
        print(json.dumps(episode.as_json(), separators=(",", ":")))


if __name__ == "__main__":
    main()
