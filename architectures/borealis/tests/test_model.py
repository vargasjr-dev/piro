import torch

from architectures.borealis.model import (
    Borealis,
    BorealisAdaptationState,
    BorealisConfig,
)
from architectures.borealis.tokenizer import BorealisTokenizer


def small_model(**overrides) -> Borealis:
    config = {
        "tokenizer_name": "byte",
        "tokenizer_merges": None,
        "vocab_size": 257,
        "embed_dim": 8,
        "context_dim": 12,
        "adaptation_learning_rate": 0.4,
        "consolidation_rate": 0.5,
        "eos_token_id": None,
        **overrides,
    }
    return Borealis(BorealisConfig(**config))


def test_borealis_run_returns_only_final_causal_logits():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])

    result = model.run(tokens)

    assert result.shape == (257,)
    assert torch.isfinite(result).all()


def test_adaptation_changes_later_logits_and_updates_durable_parameters():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])
    durable_before = {key: value.detach().clone() for key, value in model.state_dict().items()}
    initial = model.initialize_adaptation_state()

    adapted = model.run(tokens, initial, adapt=True)
    unadapted = model.run(tokens, initial, adapt=False)

    assert not torch.equal(adapted, unadapted)
    assert any(
        not torch.equal(durable_before[key], value)
        for key, value in model.state_dict().items()
    )


def test_final_output_uses_adaptation_state_after_context_adaptation():
    tokens = torch.tensor([1, 2, 3, 4])
    initial = BorealisAdaptationState(output_bias=torch.zeros(257))
    adapted_model = small_model(consolidation_rate=0.0)
    unadapted_model = small_model(consolidation_rate=0.0)
    unadapted_model.load_state_dict(adapted_model.state_dict())

    adapted = adapted_model.run(tokens, initial, adapt=True)
    unadapted = unadapted_model.run(tokens, initial, adapt=False)

    assert not torch.equal(adapted, unadapted)


def test_adaptation_state_snapshot_round_trips_and_preserves_predictions():
    model = small_model()
    tokens = torch.tensor([1, 2, 3, 4])
    state = BorealisAdaptationState(
        output_bias=torch.ones(257),
        updates=2,
        loss_ema=0.1,
    )
    snapshot = model.snapshot_adaptation_state(state)
    restored = model.load_adaptation_state(snapshot)
    durable_revision = model.save_weights()

    original = model.run(tokens, state, adapt=False)
    replay_model = small_model()
    replay_model.load_state_dict(durable_revision)
    replayed = replay_model.run(tokens, restored, adapt=False)

    assert restored.updates == state.updates
    assert restored.loss_ema == state.loss_ema
    assert torch.equal(original, replayed)


def test_consolidation_moves_adaptation_bias_to_durable_output_head_and_clears_adaptation_state():
    model = small_model()
    state = BorealisAdaptationState(
        output_bias=torch.ones(257),
        updates=2,
        loss_ema=0.1,
    )
    before = model.output_head.bias.detach().clone()

    next_state = model.consolidate_weights(state)

    assert torch.allclose(model.output_head.bias, before + 0.5)
    assert torch.equal(next_state.output_bias, torch.zeros(257))
    assert next_state.updates == 0
    assert next_state.loss_ema is None


def test_causal_loss_backpropagates_into_durable_parameters_without_adaptation_updates():
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


def test_prefill_returns_context_state_for_the_next_token():
    model = small_model(consolidation_rate=0.0)
    prompt = torch.tensor([1, 2, 3])

    state = model.prefill(prompt, adapt=False)
    expected = model.run(torch.tensor([1, 2, 3, 4]), adapt=False)
    actual = model.next_token_logits(state)

    assert state.context_state.shape == (12,)
    assert state.adaptation_state.updates == 0
    assert torch.allclose(actual, expected)


def test_generate_reuses_state_and_returns_only_new_tokens():
    model = small_model(consolidation_rate=0.0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()
        model.output_head.bias[5] = 10.0

    generated = model.generate(torch.tensor([1, 2]), max_new_tokens=3, adapt=False)

    assert torch.equal(generated, torch.tensor([5, 5, 5]))


def test_generate_with_state_returns_cleared_adaptation_state_and_final_context_state():
    model = small_model(consolidation_rate=0.0)
    initial = BorealisAdaptationState(output_bias=torch.ones(257), updates=2, loss_ema=0.5)

    generated, state = model.generate_with_state(
        torch.tensor([1, 2]),
        max_new_tokens=2,
        adaptation_state=initial,
        adapt=False,
    )

    assert generated.shape == (2,)
    assert state.context_state.shape == (12,)
    assert torch.equal(state.adaptation_state.output_bias, torch.zeros(257))
    assert state.adaptation_state.updates == 0
    assert state.adaptation_state.loss_ema is None
    assert torch.equal(initial.output_bias, torch.ones(257))


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
    model.consolidate_weights(state.adaptation_state)

    assert torch.equal(expected, torch.stack(manual))
    assert torch.allclose(expected_state.context_state, state.context_state)


def test_greedy_ties_choose_the_lowest_token_id():
    model = small_model(consolidation_rate=0.0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()

    generated = model.generate(torch.tensor([1]), max_new_tokens=2, adapt=False)

    assert torch.equal(generated, torch.tensor([0, 0]))


def test_generate_stops_at_configured_eos_and_supports_empty_continuation():
    model = small_model(consolidation_rate=0.0, eos_token_id=0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()
        model.output_head.bias[0] = 10.0

    assert torch.equal(
        model.generate(torch.tensor([1]), max_new_tokens=4, adapt=False),
        torch.tensor([0]),
    )
    assert model.generate(torch.tensor([1]), max_new_tokens=0).numel() == 0


def test_generate_allows_an_explicit_eos_override():
    model = small_model(consolidation_rate=0.0, eos_token_id=0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()
        model.output_head.bias[0] = 10.0

    generated = model.generate(
        torch.tensor([1]),
        max_new_tokens=3,
        adapt=False,
        eos_token_id=1,
    )

    assert torch.equal(generated, torch.tensor([0, 0, 0]))


def test_generate_uses_the_limit_when_no_eos_token_is_configured():
    model = small_model(consolidation_rate=0.0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()
        model.output_head.bias[0] = 10.0

    generated = model.generate(torch.tensor([1]), max_new_tokens=2, adapt=False)

    assert torch.equal(generated, torch.tensor([0, 0]))


def test_generate_rejects_invalid_limits_and_prompt_tokens():
    model = small_model()

    try:
        model.generate(torch.tensor([1]), max_new_tokens=-1)
    except ValueError as error:
        assert "non-negative" in str(error)
    else:
        raise AssertionError("negative generation length should be rejected")

    try:
        model.generate(torch.tensor([1, 300]), max_new_tokens=1)
    except ValueError as error:
        assert "within" in str(error)
    else:
        raise AssertionError("out-of-range prompt token should be rejected")


def test_two_token_sequence_still_produces_final_output_without_adaptation_steps():
    model = small_model()

    result = model.run(torch.tensor([1, 2]))

    assert result.shape == (257,)
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
        model.run(torch.tensor([1, 300]))
    except ValueError as error:
        assert "within" in str(error)
    else:
        raise AssertionError("out-of-range token should be rejected")


def test_causal_loss_is_teacher_forced_over_the_full_sequence():
    model = small_model(adaptation_learning_rate=0.0)
    tokens = torch.tensor([1, 2, 3])

    loss = model.causal_loss(tokens)

    assert loss.ndim == 0
    assert torch.isfinite(loss)


def test_byte_tokenizer_round_trips_utf8_text():
    model = small_model()
    text = "héllo 🌞"

    assert model.tokenizer.decode(model.tokenizer.encode(text)) == text


def test_invoke_returns_decoded_text_and_tokenizer_metadata():
    model = small_model(max_new_tokens=2, adaptation_learning_rate=0.0, consolidation_rate=0.0)
    with torch.no_grad():
        model.output_head.weight.zero_()
        model.output_head.bias.zero_()
        model.output_head.bias[ord("o")] = 10.0

    result = model.invoke({"parts": [{"type": "text", "text": "hello"}]})

    assert result["text"] == "oo"
    assert result["metadata"]["outputFormat"] == "text"
    assert result["metadata"]["tokenizer"] == "byte"


def test_byte_bpe_fits_lossless_compact_tokenizer():
    tokenizer = BorealisTokenizer.fit(
        ["Alice owns a customer success plan. 🛰️", "ANSWER: retention"],
        max_vocab_size=512,
    )

    assert tokenizer.name == "byte_bpe"
    assert tokenizer.vocab_size <= 512
    text = "Alice owns a customer success plan. 🛰️"
    assert tokenizer.decode(tokenizer.encode(text)) == text


def test_byte_bpe_fit_preserves_deterministic_merge_order():
    tokenizer = BorealisTokenizer.fit(["ababa", "ababb"], max_vocab_size=300)

    assert tokenizer.merges == ((97, 98), (256, 256))


def test_training_config_persists_fitted_tokenizer():
    examples = [
        type(
            "Example",
            (),
            {
                "inputs": ("Alice owns a customer success plan. " * 4,),
                "target": "retention retention",
            },
        )(),
    ]

    config = Borealis.config_for_training(examples)

    assert config["tokenizer_name"] == "byte_bpe"
    assert config["tokenizer_merges"]
    tokenizer = BorealisTokenizer(config["tokenizer_name"], config["tokenizer_merges"])
    assert tokenizer.decode(tokenizer.encode("Alice owns a customer success plan.")) == (
        "Alice owns a customer success plan."
    )


def test_output_head_reuses_token_embedding_weights():
    model = small_model()

    assert model.output_head.weight is model.token_embedding.weight
