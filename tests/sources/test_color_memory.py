import json

from sources._common.training import load_source_examples
from sources.color_memory import COLORS, generate_color_memory_dataset


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
        assert Key == "datasets/colors/train.jsonl"
        return {"Body": _Body(self.value)}


def _text(packet: dict[str, object]) -> str:
    parts = packet["parts"]
    return parts[0]["text"]


def test_default_dataset_has_twenty_train_and_five_eval_episodes():
    episodes = generate_color_memory_dataset()

    assert len(episodes) == 25
    assert sum(episode.split == "train" for episode in episodes) == 20
    assert sum(episode.split == "eval" for episode in episodes) == 5


def test_person_names_are_unique_across_the_entire_dataset():
    episodes = generate_color_memory_dataset()
    people = [person for episode in episodes for person, _color in episode.assignments]

    assert len(people) == len(set(people))


def test_each_episode_ends_with_a_query_and_answer_matches_assignment():
    episodes = generate_color_memory_dataset()

    for episode in episodes:
        assert episode.inputs[-1]["parts"][0]["text"] == f"{episode.target_person}?"
        assert episode.answer in COLORS
        assert dict(episode.assignments)[episode.target_person] == episode.answer
        assert all("?" not in _text(packet) for packet in episode.inputs[:-1])


def test_generation_is_deterministic_and_serializes_as_json():
    first = generate_color_memory_dataset(seed=11)
    second = generate_color_memory_dataset(seed=11)

    assert [episode.as_json() for episode in first] == [episode.as_json() for episode in second]
    json.dumps(first[0].as_json())


def test_source_entrypoint_decodes_color_memory_examples():
    record = generate_color_memory_dataset(train_count=1, test_count=0, seed=11)[0].as_json()
    records = json.dumps(record)
    examples = load_source_examples(
        source_path="sources/color-memory/main.py",
        r2_client=_R2(records),
        bucket="test",
        prefix="datasets/colors",
        split="train",
        limit=1,
    )

    episode = generate_color_memory_dataset(train_count=1, test_count=0, seed=11)[0]
    assert examples[0].inputs[-1] == f"{episode.target_person}?"
    assert examples[0].target == episode.answer
    assert examples[0].metadata["task"] == "color_memory"
