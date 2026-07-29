from pathlib import Path

import torch

from architectures._common.runtime import load_training_runtime
from sources._common.training import load_source_examples


REPO_ROOT = Path(__file__).parents[1]


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
        assert Key == "datasets/example/train.jsonl"
        return {"Body": _Body(self.value)}


def test_source_entrypoint_decodes_owner_policy_examples_without_runner_knowledge():
    records = (
        '{"inputs":[{"parts":[{"type":"text","text":"history"}]},'
        '{"parts":[{"type":"text","text":"query"}]}],"answerIndex":2}'
    )
    examples = load_source_examples(
        source_path="sources/owner-policy-worlds/main.py",
        r2_client=_R2(records),
        bucket="test",
        prefix="datasets/example",
        split="train",
        limit=1,
    )
    assert examples[0].inputs == ("history", "query")
    assert examples[0].target == 2


def test_architecture_entrypoint_supplies_training_runtime():
    runtime = load_training_runtime(
        architecture_path="architectures/borealis/main.py",
        source_path="sources/owner-policy-worlds/main.py",
        device=torch.device("cpu"),
        seed=42,
    )
    assert runtime.config()["vocab_size"] == 32
    assert runtime.parameter_count() > 0


def test_modal_runner_contains_no_product_registry_or_branch():
    source = (REPO_ROOT / "platform" / "modal" / "training.py").read_text()
    forbidden = (
        "sorting-sequences",
        "associative-recall",
        "owner-policy-worlds",
        "ctm-10x",
        "data_source",
        "model_template",
    )
    assert not any(value in source for value in forbidden)
    assert "sourcePath" in source
    assert "architecturePath" in source
