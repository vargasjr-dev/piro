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


def test_long_sequence_training_stays_finite():
    """Meta-gradients through the unrolled inner loop must not explode.

    The production NaN (corona-smoke-500) came from one enormous
    meta-gradient through the unrolled loop poisoning every weight. This
    walks real optimizer steps over long sequences and asserts the loss and
    weights stay finite.
    """
    model = Corona(_small_config())
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    long_text = "the quick brown fox jumps over the lazy dog " * 40  # ~1.8k tokens
    for _ in range(6):
        optimizer.zero_grad()
        loss = model.training_loss(_lm_example(long_text))
        assert torch.isfinite(loss), "training loss diverged in the forward pass"
        loss.backward()
        assert model.gradient_clip_max_norm is not None
        torch.nn.utils.clip_grad_norm_(model.parameters(), model.gradient_clip_max_norm)
        optimizer.step()
        for parameter in model.parameters():
            assert torch.isfinite(parameter).all(), "weights became non-finite"


def test_clip_attr_is_applied_by_the_shared_trainer():
    """The base train_step must honor gradient_clip_max_norm."""
    model = Corona(_small_config())
    phases: list[tuple[str, dict]] = []

    def on_phase(name: str, details: dict) -> None:
        phases.append((name, details))

    optimizer = torch.optim.SGD(model.parameters(), lr=0.1)
    loss = model.train_step([_lm_example("hello world")], optimizer, on_phase=on_phase)
    assert torch.isfinite(torch.tensor(loss))
    names = [name for name, _ in phases]
    assert "gradient_clipped" in names
    assert "nonfinite_gradient_skipped_step" not in names
    clipped = next(details for name, details in phases if name == "gradient_clipped")
    assert clipped["clipMaxNorm"] == 1.0
    # clip_grad_norm_ reports the pre-clip norm; clipping still bounded it.
    assert 0.0 < clipped["totalNorm"]


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
