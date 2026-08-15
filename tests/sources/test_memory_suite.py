import json

from sources._common.training import load_source_examples
from sources.memory_suite import make_cases


class _Body:
    def __init__(self, value: str):
        self._value = value

    def read(self) -> bytes:
        return self._value.encode("utf-8")


class _R2:
    def __init__(self, value: str):
        self.value = value

    def get_object(self, *, Bucket: str, Key: str):
        assert Bucket == "test"
        assert Key == "datasets/memory-suite/train.jsonl"
        return {"Body": _Body(self.value)}


def _records() -> list[dict[str, object]]:
    return [
        {
            "inputs": [
                {"parts": [{"type": "text", "text": text}]} for text in case["inputs"]
            ],
            "answer": case["expected"],
            "metadata": {
                "benchmark": "memory-suite",
                "caseId": case["id"],
                "category": case["category"],
                "split": "eval",
            },
        }
        for case in make_cases()
    ]


def test_memory_suite_has_ten_stable_cases_and_long_gap_fixture():
    cases = make_cases()

    assert len(cases) == 10
    assert [case["id"] for case in cases] == [
        "delayed-single-fact",
        "multi-fact-binding",
        "explicit-overwrite",
        "temporal-version",
        "near-neighbor-interference",
        "ordered-sequence",
        "two-hop-relation",
        "source-attribution",
        "capacity-long-gap",
        "authority-conflict",
    ]
    assert len(cases[8]["inputs"]) == 66


def test_memory_suite_source_decodes_records_for_training():
    records = _records()
    examples = load_source_examples(
        source_path="sources/memory-suite/main.py",
        r2_client=_R2("\n".join(json.dumps(record) for record in records)),
        bucket="test",
        prefix="datasets/memory-suite",
        split="eval",
        limit=10,
    )

    assert len(examples) == 10
    assert examples[0].target == "cobalt"
    assert examples[0].metadata["caseId"] == "delayed-single-fact"
