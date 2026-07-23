import json

from model.data.associative_recall import generate_associative_recall_dataset, make_memory_episode


def test_episode_serializes_ordered_piro_inputs_without_role_labels():
    episode = make_memory_episode(n_writes=3, delay=5, seed=7)
    record = episode.as_json()

    assert set(record) == {"inputs"}
    assert len(record["inputs"]) == episode.request_count
    assert len(record["inputs"]) >= 2
    assert [item["parts"][0]["type"] for item in record["inputs"]] == ["text"] * episode.request_count
    assert all(set(item) == {"parts"} for item in record["inputs"])
    assert all("WRITE" not in item["parts"][0]["text"] for item in record["inputs"])
    assert all("DISTRACT" not in item["parts"][0]["text"] for item in record["inputs"])
    assert all("QUERY" not in item["parts"][0]["text"] for item in record["inputs"])
    assert all(" = " in line for line in episode.write_observation.splitlines())
    assert all(line.startswith("token_") for line in episode.distractor_observation.splitlines())
    assert sum(len(packet.splitlines()) for packet in episode.write_packets) == len(episode.writes)
    assert sum(len(packet.splitlines()) for packet in episode.distractor_packets) == len(episode.distractors)
    assert episode.query_observation == episode.target_key
    assert [item["parts"][0]["text"] for item in record["inputs"][:-1]] == [
        *episode.write_packets,
        *episode.distractor_packets,
    ]
    assert record["inputs"][-1]["parts"][0]["text"] == episode.query_observation
    assert "label" not in record
    assert "metadata" not in record


def test_serialized_record_is_json_and_deterministic():
    first = generate_associative_recall_dataset(10, n_writes=(2, 4), delay=(1, 3), seed=11)
    second = generate_associative_recall_dataset(10, n_writes=(2, 4), delay=(1, 3), seed=11)

    assert [episode.as_json() for episode in first] == [episode.as_json() for episode in second]
    json.dumps(first[0].as_json())


def test_dataset_preserves_unique_keys_and_target_value_in_write_context():
    episodes = generate_associative_recall_dataset(
        10,
        n_writes=(2, 4),
        delay=(1, 3),
        write_requests=(1, 4),
        distractor_requests=(1, 3),
        seed=11,
    )

    assert len({episode.request_count for episode in episodes}) > 1
    for episode in episodes:
        keys = [fact.key for fact in episode.writes]
        assert len(keys) == len(set(keys))
        assert episode.target_key in keys
        assert episode.answer in episode.write_observation
        assert episode.answer not in episode.query_observation
