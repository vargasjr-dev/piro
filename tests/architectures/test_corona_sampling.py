import torch

from architectures.corona.model import Corona, _sample_token

from test_corona import _small_config


def test_temperature_zero_stays_greedy_argmax():
    model = Corona(_small_config())
    prompt = torch.tensor([72, 101, 108])
    greedy, greedy_state = model.generate_with_state(prompt, 4, temperature=0.0)
    default, default_state = model.generate_with_state(prompt, 4)
    assert greedy.tolist() == default.tolist()
    assert greedy_state.updates == default_state.updates


def test_positive_temperature_samples_and_seeding_is_deterministic():
    model = Corona(_small_config())
    prompt = torch.tensor([72, 101, 108])
    torch.manual_seed(7)
    first, _ = model.generate_with_state(prompt, 8, temperature=0.9, top_k=5)
    torch.manual_seed(7)
    second, _ = model.generate_with_state(prompt, 8, temperature=0.9, top_k=5)
    assert first.tolist() == second.tolist()


def test_high_temperature_can_diverge_from_greedy():
    model = Corona(_small_config())
    prompt = torch.tensor([72, 101, 108])
    greedy, _ = model.generate_with_state(prompt, 8, temperature=0.0)
    torch.manual_seed(3)
    sampled, _ = model.generate_with_state(prompt, 8, temperature=4.0)
    assert sampled.tolist() != greedy.tolist()


def test_top_k_restricts_sampling_to_the_k_highest_logits():
    logits = torch.tensor([10.0, 9.0, 0.0, 0.0, 0.0])
    torch.manual_seed(0)
    picks = {_sample_token(logits, 1.0, 2).item() for _ in range(200)}
    assert picks <= {0, 1}
    assert picks


def test_sample_token_rejects_invalid_top_k():
    logits = torch.zeros(5)
    try:
        _sample_token(logits, 1.0, 0)
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for top_k=0")


def test_invoke_rejects_bad_sampling_and_reports_good_sampling():
    model = Corona(_small_config())
    packet = {"parts": [{"type": "text", "text": "hi"}]}
    for bad in (
        {"temperature": "hot"},
        {"temperature": -1},
        {"topK": 0},
        "greedy",
    ):
        try:
            model.invoke({**packet, "sampling": bad})
        except ValueError:
            pass
        else:
            raise AssertionError(f"expected ValueError for sampling={bad!r}")

    model.config.max_new_tokens = 3
    result = model.invoke({**packet, "sampling": {"temperature": 0.0}})
    assert result["metadata"]["sampling"] == {"temperature": 0.0, "topK": None}
    assert "text" in result
