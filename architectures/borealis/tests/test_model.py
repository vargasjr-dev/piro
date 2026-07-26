import torch
import torch.nn.functional as F

from architectures.borealis.model import (
    Borealis,
    BorealisConfig,
    BorealisFastState,
)


def small_model(**overrides) -> Borealis:
    config = {
        "vocab_size": 7,
        "embed_dim": 8,
        "hidden_dim": 12,
        "fast_learning_rate": 0.4,
        "consolidation_rate": 0.5,
        **overrides,
    }
    return Borealis(BorealisConfig(**config))


def test_borealis_run_returns_only_final_causal_logits():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])

    result = model.run(tokens)

    assert result.shape == (7,)
    assert torch.isfinite(result).all()


def test_fast_adaptation_changes_later_logits_and_updates_durable_parameters():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])
    durable_before = {key: value.detach().clone() for key, value in model.state_dict().items()}
    initial = model.initialize_fast_state()

    adapted = model.run(tokens, initial, adapt=True)
    unadapted = model.run(tokens, initial, adapt=False)

    assert not torch.equal(adapted, unadapted)
    assert any(
        not torch.equal(durable_before[key], value)
        for key, value in model.state_dict().items()
    )


def test_final_output_uses_fast_state_after_context_adaptation():
    tokens = torch.tensor([1, 2, 3, 4])
    initial = BorealisFastState(output_bias=torch.zeros(7))
    adapted_model = small_model(consolidation_rate=0.0)
    unadapted_model = small_model(consolidation_rate=0.0)
    unadapted_model.load_state_dict(adapted_model.state_dict())

    adapted = adapted_model.run(tokens, initial, adapt=True)
    unadapted = unadapted_model.run(tokens, initial, adapt=False)

    assert not torch.equal(adapted, unadapted)


def test_fast_state_snapshot_round_trips_and_preserves_predictions():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])
    state = BorealisFastState(
        output_bias=torch.ones(7),
        updates=2,
        loss_ema=0.1,
    )
    snapshot = model.snapshot_fast_state(state)
    restored = model.load_fast_state(snapshot)
    durable_revision = model.save_weights()

    original = model.run(tokens, state, adapt=False)
    replay_model = small_model()
    replay_model.load_state_dict(durable_revision)
    replayed = replay_model.run(tokens, restored, adapt=False)

    assert restored.updates == state.updates
    assert restored.loss_ema == state.loss_ema
    assert torch.equal(original, replayed)


def test_consolidation_moves_fast_bias_to_durable_output_head_and_clears_fast_state():
    model = small_model()
    state = BorealisFastState(
        output_bias=torch.ones(7),
        updates=2,
        loss_ema=0.1,
    )
    before = model.output_head.bias.detach().clone()

    next_state = model.consolidate_weights(state)

    assert torch.allclose(model.output_head.bias, before + 0.5)
    assert torch.equal(next_state.output_bias, torch.zeros(7))
    assert next_state.updates == 0
    assert next_state.loss_ema is None


def test_causal_loss_backpropagates_into_durable_parameters_without_fast_updates():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])

    loss = model.causal_loss(tokens)
    loss.backward()

    assert model.output_head.weight.grad is not None
    assert model.output_head.bias.grad is not None
    assert model.recurrent.weight_hh.grad is not None


def test_borealis_forward_matches_no_adaptation_final_logits():
    model = small_model()
    tokens = torch.tensor([1, 2, 3])

    expected = model.run(tokens, adapt=False)
    actual = model(tokens)

    assert torch.allclose(actual, expected)


def test_prefill_returns_hidden_state_for_the_next_token():
    model = small_model(consolidation_rate=0.0)
    prompt = torch.tensor([1, 2, 3])

    state = model.prefill(prompt, adapt=False)
    expected = model.run(torch.tensor([1, 2, 3, 4]), adapt=False)
    actual = model.next_token_logits(state)

    assert state.hidden.shape == (12,)
    assert state.fast_state.updates == 0
    assert torch.allclose(actual, expected)


def test_generate_reuses_state_and_returns_only_new_tokens():
    model = small_model(consolidation_rate=0.0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()
        model.output_head.bias[5] = 10.0

    generated = model.generate(torch.tensor([1, 2]), max_new_tokens=3, adapt=False)

    assert torch.equal(generated, torch.tensor([5, 5, 5]))


def test_generate_with_state_returns_cleared_fast_state_and_final_hidden_state():
    model = small_model(consolidation_rate=0.0)
    initial = BorealisFastState(output_bias=torch.ones(7), updates=2, loss_ema=0.5)

    generated, state = model.generate_with_state(
        torch.tensor([1, 2]),
        max_new_tokens=2,
        fast_state=initial,
        adapt=False,
    )

    assert generated.shape == (2,)
    assert state.hidden.shape == (12,)
    assert torch.equal(state.fast_state.output_bias, torch.zeros(7))
    assert state.fast_state.updates == 0
    assert state.fast_state.loss_ema is None
    assert torch.equal(initial.output_bias, torch.ones(7))


def test_generation_state_matches_manual_prefill_and_decode():
    model = small_model(consolidation_rate=0.0)
    prompt = torch.tensor([1, 2])
    expected, expected_state = model.generate_with_state(prompt, 3, adapt=False)

    state = model.prefill(prompt, adapt=False)
    manual = []
    for _ in range(3):
        token = torch.argmax(model.next_token_logits(state), dim=-1)
        manual.append(token)
        state = model.advance_generation(state, token)
    model.consolidate_weights(state.fast_state)

    assert torch.equal(expected, torch.stack(manual))
    assert torch.allclose(expected_state.hidden, state.hidden)


def test_greedy_ties_choose_the_lowest_token_id():
    model = small_model(consolidation_rate=0.0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()

    generated = model.generate(torch.tensor([1]), max_new_tokens=2, adapt=False)

    assert torch.equal(generated, torch.tensor([0, 0]))


def test_generate_stops_at_eos_and_supports_empty_continuation():
    model = small_model(consolidation_rate=0.0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()
        model.output_head.bias[0] = 10.0

    assert torch.equal(
        model.generate(torch.tensor([1]), max_new_tokens=4, adapt=False, eos_token_id=0),
        torch.tensor([0]),
    )
    assert model.generate(torch.tensor([1]), max_new_tokens=0).numel() == 0


def test_generate_rejects_invalid_limits_and_prompt_tokens():
    model = small_model()

    try:
        model.generate(torch.tensor([1]), max_new_tokens=-1)
    except ValueError as error:
        assert "non-negative" in str(error)
    else:
        raise AssertionError("negative generation length should be rejected")

    try:
        model.generate(torch.tensor([1, 9]), max_new_tokens=1)
    except ValueError as error:
        assert "within" in str(error)
    else:
        raise AssertionError("out-of-range prompt token should be rejected")


def test_two_token_sequence_still_produces_final_output_without_adaptation_steps():
    model = small_model()

    result = model.run(torch.tensor([1, 2]))

    assert result.shape == (7,)
    assert torch.isfinite(result).all()


def test_invalid_sequences_are_rejected():
    model = small_model()

    try:
        model.run(torch.tensor([1]))
    except ValueError as error:
        assert "at least two" in str(error)
    else:
        raise AssertionError("short token sequence should be rejected")

    try:
        model.run(torch.tensor([1, 9]))
    except ValueError as error:
        assert "within" in str(error)
    else:
        raise AssertionError("out-of-range token should be rejected")


def test_causal_loss_uses_each_next_token_as_target():
    model = small_model(fast_learning_rate=0.0)
    tokens = torch.tensor([1, 2, 3])
    result = model.run(tokens, adapt=False)

    manual = F.cross_entropy(result.unsqueeze(0), tokens[-1].unsqueeze(0))

    assert torch.allclose(model.causal_loss(tokens), manual)
