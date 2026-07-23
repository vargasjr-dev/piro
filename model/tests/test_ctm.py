import torch

from model.ctm import CTMConfig, ContinuousThoughtModel, PlasticConfig


def test_ctm_forward_has_expected_shape_and_persistent_state():
    model = ContinuousThoughtModel(n_neurons=4, embed_dim=3, query_dim=3, value_dim=3, n_classes=2)
    sample = torch.randn(2, 3)
    first = model(sample)
    before = model.snapshot_state()["history_entries"][-1].clone()
    model(sample)
    after = model.snapshot_state()["history_entries"][-1]
    assert first.logits.shape == (2,)
    assert not torch.equal(before, after)


def test_associative_recall_10x_config_is_near_ten_times_baseline():
    baseline = ContinuousThoughtModel(
        CTMConfig(n_neurons=4, embed_dim=8, query_dim=8, value_dim=8, hidden_dim=16, n_classes=32)
    )
    scaled = ContinuousThoughtModel(
        CTMConfig(n_neurons=6, embed_dim=16, query_dim=16, value_dim=16, hidden_dim=88, n_classes=32)
    )
    baseline_params = sum(parameter.numel() for parameter in baseline.parameters())
    scaled_params = sum(parameter.numel() for parameter in scaled.parameters())
    assert baseline_params == 2_005
    assert scaled_params == 20_047
    assert abs(scaled_params / baseline_params - 10) < 0.001


def test_plastic_state_updates_and_can_be_reset():
    model = ContinuousThoughtModel(n_neurons=3, embed_dim=2, query_dim=2, value_dim=2, n_classes=2, enable_plasticity=True)
    model(sample := torch.randn(2, 2))
    before = model.snapshot_state()["plastic_weights"].clone()
    model(sample)
    after = model.snapshot_state()["plastic_weights"]
    assert not torch.equal(before, after)
    model.reset()
    reset = model.snapshot_state()["history_entries"]
    assert reset == []
