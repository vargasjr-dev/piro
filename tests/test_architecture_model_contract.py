from pathlib import Path

from architectures._common import load_architecture
from architectures.borealis.model import Borealis
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
    assert examples[0].continuation_prefix == "\nANSWER:"
    assert examples[0].metadata["task"] == "owner_policy"


def test_canonical_entrypoint_resolves_to_one_architecture_class():
    architecture = load_architecture("architectures/borealis/main.py")
    model = architecture.from_config({})
    assert architecture is Borealis
    assert isinstance(model, Borealis)
    assert model.parameter_count() > 0


def test_model_class_owns_training_loss_without_evaluation_contract():
    architecture = load_architecture("architectures/borealis/main.py")
    model = architecture.from_config({"tokenizer_name": "byte", "vocab_size": 257, "embed_dim": 4, "context_dim": 6})
    example = type("Example", (), {"inputs": ("hello",), "target": "world", "metadata": {}})()
    loss = model.training_loss(example)
    assert loss.ndim == 0
    assert not hasattr(model, "evaluate")


def test_modal_runner_contains_no_product_registry_or_branch():
    source = (REPO_ROOT / "platform" / "modal" / "training.py").read_text()
    forbidden = (
        "sorting-sequences",
        "associative-recall",
        "owner-policy-worlds",
        "ctm-10x",
        "data_source",
        "model_template",
        "TrainingRuntime",
        "load_training_runtime",
    )
    assert not any(value in source for value in forbidden)
    assert "sourcePath" in source
    assert "architecturePath" in source
