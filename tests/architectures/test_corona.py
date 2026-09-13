import torch

from architectures._common import load_architecture
from architectures.corona.model import Corona, CoronaConfig


def _small_config() -> CoronaConfig:
    return CoronaConfig(
        tokenizer_name="byte",
        vocab_size=257,
        model_dim=12,
        inner_dim=10,
        embed_table_dim=6,
        num_blocks=2,
        chunk_size=4,
        max_new_tokens=4,
        target_prefix="",
    )


def _lm_example(text: str):
    return type("Example", (), {"inputs": (text,), "target": "", "metadata": {}})()


def test_entrypoint_resolves_to_corona():
    architecture = load_architecture("architectures/corona/main.py")
    assert architecture is Corona
    model = architecture.from_config(
        {"tokenizer_name": "byte", "vocab_size": 257, "model_dim": 8, "inner_dim": 8, "embed_table_dim": 4}
    )
    assert isinstance(model, Corona)
    assert model.parameter_count() > 0


def test_training_loss_backprops_through_the_inner_loop():
    model = Corona(_small_config())
    loss = model.training_loss(_lm_example("hello"))
    assert loss.ndim == 0
    loss.backward()
    block = model.blocks[0]
    # Meta-learning wiring: the outer loss reaches the inner-loop projections,
    # the fast-weight initialization, and the learned inner learning rate.
    for parameter in (block.theta_k.weight, block.theta_q.weight, block.w_init, block.inner_learning_rate):
        assert parameter.grad is not None
        assert parameter.grad.abs().sum() > 0


def test_prefill_adapts_the_fast_weight_state():
    model = Corona(_small_config())
    tokens = torch.tensor([72, 101, 108, 108, 111])  # "Hello"
    state = model.prefill(tokens)
    assert state.updates == tokens.numel()
    for matrix, block in zip(state.block_states, model.blocks):
        assert not torch.equal(matrix, block.w_init.detach())
        assert matrix.shape == block.w_init.shape


def test_adaptation_runs_on_generated_tokens_too():
    model = Corona(_small_config())
    prompt = torch.tensor([72, 101])
    generated, final_state = model.generate_with_state(prompt, max_new_tokens=3, adapt=True)
    assert final_state.updates == prompt.numel() + len(generated)


def test_generation_state_survives_a_snapshot_round_trip():
    model = Corona(_small_config())
    state = model.prefill(torch.tensor([72, 101, 108]))
    snapshot = model.snapshot_generation_state(state)
    restored = model.load_generation_state({
        "streamInput": snapshot["streamInput"].tolist(),
        "lastEmbed": snapshot["lastEmbed"].tolist(),
        "blockStates": [matrix.tolist() for matrix in snapshot["blockStates"]],
        "updates": snapshot["updates"],
        "lossEma": snapshot["lossEma"],
    })
    assert torch.equal(model.next_token_logits(restored), model.next_token_logits(state))


def test_invoke_returns_text_and_json_safe_state():
    model = Corona(_small_config())
    result = model.invoke({"parts": [{"type": "text", "text": "hello"}]})
    assert isinstance(result["text"], str)
    assert result["metadata"]["outputFormat"] == "text"
    assert result["metadata"]["tokenizer"] == "byte"
    assert result["metadata"]["innerUpdates"] > 0

    def assert_json_safe(value: object) -> None:
        if isinstance(value, dict):
            for inner in value.values():
                assert_json_safe(inner)
        elif isinstance(value, list):
            for inner in value:
                assert_json_safe(inner)
        else:
            assert not isinstance(value, torch.Tensor)

    assert_json_safe(result["state"])
