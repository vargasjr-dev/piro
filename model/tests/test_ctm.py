import torch

from model.ctm import ContinuousThoughtModel, PlasticConfig


def test_ctm_forward_has_expected_shape_and_persistent_state():
    model = ContinuousThoughtModel(n_neurons=4, embed_dim=3, query_dim=3, value_dim=3, n_classes=2)
    sample = torch.randn(2, 3)
    first = model(sample)
    before = model.snapshot_state()["history_buffer"].clone()
    model(sample)
    after = model.snapshot_state()["history_buffer"]
    assert first.logits.shape == (2,)
    assert not torch.equal(before, after)


def test_plastic_state_updates_and_can_be_reset():
    model = ContinuousThoughtModel(n_neurons=3, embed_dim=2, query_dim=2, value_dim=2, n_classes=2, enable_plasticity=True)
    model(sample := torch.randn(2, 2))
    before = model.snapshot_state()["plastic_weights"].clone()
    model(sample)
    after = model.snapshot_state()["plastic_weights"]
    assert not torch.equal(before, after)
    model.reset()
    reset = model.snapshot_state()["history_buffer"]
    assert torch.count_nonzero(reset) == 0
