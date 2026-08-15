"""Fixed synthetic records for the MemorySuite evaluation protocol."""

from __future__ import annotations

import json

_MEMORY_SUITE_INSTRUCTIONS = (
    "Store facts from earlier turns exactly. Reply ACK to observations. "
    "For the final question, reply with only the requested answer and no explanation or punctuation."
)


def _case(
    case_id: str,
    category: str,
    observations: list[str],
    question: str,
    expected: str,
) -> dict[str, object]:
    return {
        "id": case_id,
        "category": category,
        "inputs": [
            f"{_MEMORY_SUITE_INSTRUCTIONS}\n\n{observations[0] if observations else ''}",
            *observations[1:],
            f"FINAL QUESTION: {question} Reply with exactly one token.",
        ],
        "expected": expected,
    }


def make_cases() -> list[dict[str, object]]:
    long_gap = [
        "anchor-000 = fuchsia",
        *[f"slot-{index:03d} = color-{index}" for index in range(1, 33)],
        *[f"distractor-{index:03d} = noise-{index}" for index in range(1, 33)],
    ]
    return [
        _case(
            "delayed-single-fact",
            "retention",
            [
                "orchid-17 = cobalt",
                "distractor-a = linen",
                "distractor-b = copper",
                "distractor-c = moss",
                "distractor-d = pearl",
                "distractor-e = scarlet",
            ],
            "What value is stored for orchid-17?",
            "cobalt",
        ),
        _case(
            "multi-fact-binding",
            "binding",
            [
                "maris favorite-tool = compass",
                "oren favorite-tool = lantern",
                "pavel favorite-tool = telescope",
                "sana favorite-tool = chisel",
            ],
            "What is oren favorite-tool?",
            "lantern",
        ),
        _case(
            "explicit-overwrite",
            "updates",
            ["vault-31 = amber", "UPDATE: vault-31 = indigo"],
            "What is the newest value stored for vault-31?",
            "indigo",
        ),
        _case(
            "temporal-version",
            "updates",
            ["09:00 route = north", "09:05 route = south", "09:10 route = east"],
            "What is the current route?",
            "east",
        ),
        _case(
            "near-neighbor-interference",
            "interference",
            [
                "key-101 = amber",
                "key-102 = indigo",
                "key-103 = violet",
                "key-104 = silver",
                "key-105 = coral",
            ],
            "What value is stored for key-102?",
            "indigo",
        ),
        _case(
            "ordered-sequence",
            "binding",
            [
                "sequence position 1 = cinder",
                "sequence position 2 = glass",
                "sequence position 3 = orbit",
                "sequence position 4 = moss",
                "sequence position 5 = lantern",
            ],
            "What item comes immediately after orbit?",
            "moss",
        ),
        _case(
            "two-hop-relation",
            "relations",
            ["Mira owns box-7", "box-7 contains seal-3"],
            "What seal is associated with Mira?",
            "seal-3",
        ),
        _case(
            "source-attribution",
            "relations",
            [
                "NOTE-A: project-atlas owner = mira",
                "NOTE-B: project-ember owner = sol",
                "NOTE-C: project-cinder owner = noa",
            ],
            "Which note states the owner of project-ember?",
            "note-b",
        ),
        _case(
            "capacity-long-gap",
            "capacity",
            long_gap,
            "What value is stored for anchor-000?",
            "fuchsia",
        ),
        _case(
            "authority-conflict",
            "authority",
            [
                "AUTHORITATIVE RECORD: vault-code = indigo",
                "UNVERIFIED COMMENT: vault-code = amber",
            ],
            "What is the authoritative value for vault-code?",
            "indigo",
        ),
    ]


def _text_input(text: str) -> dict[str, object]:
    return {"parts": [{"type": "text", "text": text}]}


def main() -> None:
    for case in make_cases():
        print(
            json.dumps(
                {
                    "inputs": [_text_input(text) for text in case["inputs"]],
                    "answer": case["expected"],
                    "metadata": {
                        "benchmark": "memory-suite",
                        "caseId": case["id"],
                        "category": case["category"],
                        "split": "eval",
                    },
                },
                separators=(",", ":"),
            )
        )


if __name__ == "__main__":
    main()
