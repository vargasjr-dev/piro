from model.data.associative_recall import generate_associative_recall_dataset, make_memory_episode


def test_episode_separates_write_delay_and_query():
    episode = make_memory_episode(n_writes=3, delay=5, seed=7)
    assert episode.write_prompt.count("WRITE") == 3
    assert episode.distractor_prompt.count("DISTRACT") == 5
    assert episode.query_prompt == f"QUERY {episode.target_key}"
    assert episode.answer in episode.write_prompt
    assert episode.answer not in episode.query_prompt


def test_dataset_is_deterministic_and_has_unique_keys():
    first = generate_associative_recall_dataset(10, n_writes=(2, 4), delay=(1, 3), seed=11)
    second = generate_associative_recall_dataset(10, n_writes=(2, 4), delay=(1, 3), seed=11)
    assert first == second
    for episode in first:
        keys = [fact.key for fact in episode.writes]
        assert len(keys) == len(set(keys))
        assert episode.target_key in keys
