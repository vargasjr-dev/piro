import torch
import torch.nn.functional as F

from experiments.borealis.architectures.borealis.borealis import (
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


def test_borealis_run_returns_causal_logits_and_fast_state():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])

    result = model.run(tokens)

    assert result.logits.shape == (7,)
    assert result.logits_sequence.shape == (3, 7)
    assert result.predictions.shape == (3,)
    assert result.loss.ndim == 0
    assert torch.isfinite(result.loss)
    assert result.fast_state.updates == 0
    assert result.fast_state.loss_ema is None


def test_fast_adaptation_changes_later_logits_and_updates_durable_parameters():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])
    durable_before = {key: value.detach().clone() for key, value in model.state_dict().items()}
    initial = model.initialize_fast_state()

    adapted = model.run(tokens, initial, adapt=True)
    unadapted = model.run(tokens, initial, adapt=False)

    assert not torch.equal(adapted.logits, unadapted.logits)
    assert any(
        not torch.equal(durable_before[key], value)
        for key, value in model.state_dict().items()
    )


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

    original = model.run(tokens, state, adapt=False)
    replayed = model.run(tokens, restored, adapt=False)

    assert restored.updates == state.updates
    assert restored.loss_ema == state.loss_ema
    assert torch.equal(original.logits, replayed.logits)


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


def test_borealis_forward_matches_no_adaptation_final_logits():
    model = small_model()
    tokens = torch.tensor([1, 2, 3])

    expected = model.run(tokens, adapt=False).logits
    actual = model(tokens)

    assert torch.allclose(actual, expected)


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

    manual = F.cross_entropy(result.logits_sequence, tokens[1:])

    assert torch.allclose(result.loss, manual)
