"""Tests for CTM, BaselineTransformer, and Trainer."""

import pytest
import torch

from model.ctm import ContinuousThoughtModel, CTMConfig
from model.baseline_transformer import BaselineTransformer, TransformerConfig
from model.trainer import Trainer, TrainerConfig


# ── Shared configs ────────────────────────────────────────────────────────────

CTM_CFG = CTMConfig(n_neurons=4, embed_dim=8, query_dim=8, value_dim=4, hidden_dim=16, n_classes=5)
T_CFG   = TransformerConfig(embed_dim=8, n_heads=2, ffn_dim=6, n_layers=2, n_classes=5)
EMBEDDINGS = torch.randn(4, 8)


# ── ContinuousThoughtModel ────────────────────────────────────────────────────

class TestCTM:
    @pytest.fixture
    def model(self):
        return ContinuousThoughtModel(CTM_CFG)

    def test_logits_shape(self, model):
        out = model(EMBEDDINGS)
        assert out.logits.shape == (5,)

    def test_probs_shape(self, model):
        out = model(EMBEDDINGS)
        assert out.probs.shape == (5,)

    def test_probs_sum_to_one(self, model):
        out = model(EMBEDDINGS)
        assert out.probs.sum().item() == pytest.approx(1.0, abs=1e-5)

    def test_flat_embedding_accepted(self, model):
        flat = torch.randn(8)
        out = model(flat)
        assert out.logits.shape == (5,)

    def test_deterministic(self, model):
        out1 = model(EMBEDDINGS)
        out2 = model(EMBEDDINGS)
        assert torch.allclose(out1.logits, out2.logits)

    def test_count_parameters(self, model):
        assert model.count_parameters() > 0

    def test_parameter_count_matches_expected(self, model):
        # nNeurons=4, embedDim=8, queryDim=8, valueDim=4, hiddenDim=16, nClasses=5
        # SyncAttention (no bias): 8*16 + 8*8 + 4*8 = 128+64+32 = 224
        # ConfidenceHead (with bias): 16*16+16 + 1*16+1 = 272+17 = 289
        # OutputHead (with bias): 16*16+16 + 5*16+5 = 272+85 = 357
        # Total: 870
        assert model.count_parameters() == 870

    def test_gradients_flow(self, model):
        out = model(EMBEDDINGS)
        loss = torch.nn.functional.cross_entropy(out.logits.unsqueeze(0), torch.tensor([0]))
        loss.backward()
        grads = [p.grad for p in model.parameters() if p.grad is not None]
        assert len(grads) > 0


# ── BaselineTransformer ───────────────────────────────────────────────────────

class TestBaselineTransformer:
    @pytest.fixture
    def model(self):
        return BaselineTransformer(T_CFG)

    def test_logits_shape(self, model):
        assert model(EMBEDDINGS).shape == (5,)

    def test_flat_embedding_accepted(self, model):
        assert model(torch.randn(8)).shape == (5,)

    def test_deterministic(self, model):
        assert torch.allclose(model(EMBEDDINGS), model(EMBEDDINGS))

    def test_invalid_heads_raises(self):
        with pytest.raises(ValueError, match="divisible"):
            BaselineTransformer(TransformerConfig(embed_dim=8, n_heads=3))

    def test_count_parameters(self, model):
        assert model.count_parameters() > 0

    def test_gradients_flow(self, model):
        logits = model(EMBEDDINGS)
        loss = torch.nn.functional.cross_entropy(logits.unsqueeze(0), torch.tensor([0]))
        loss.backward()
        grads = [p.grad for p in model.parameters() if p.grad is not None]
        assert len(grads) > 0


# ── Parameter count match (<10% delta) ───────────────────────────────────────

class TestParameterCountMatch:
    def test_within_10_percent(self):
        ctm   = ContinuousThoughtModel(CTM_CFG)
        base  = BaselineTransformer(T_CFG)
        delta = abs(ctm.count_parameters() - base.count_parameters()) / ctm.count_parameters()
        assert delta < 0.10

    def test_ctm_is_870(self):
        assert ContinuousThoughtModel(CTM_CFG).count_parameters() == 870


# ── Trainer ───────────────────────────────────────────────────────────────────

def _tiny_dataset(n: int, n_neurons: int, embed_dim: int, n_classes: int, seed: int = 0):
    torch.manual_seed(seed)
    return [(torch.randn(n_neurons, embed_dim), i % n_classes) for i in range(n)]


class TestTrainer:
    @pytest.fixture
    def train_data(self):
        return _tiny_dataset(32, 4, 8, 5, seed=0)

    @pytest.fixture
    def val_data(self):
        return _tiny_dataset(8, 4, 8, 5, seed=1)

    def test_trainer_returns_history(self, train_data, val_data):
        model = BaselineTransformer(T_CFG)
        cfg   = TrainerConfig(epochs=2, log_every=0)
        history = Trainer(model, cfg).fit(train_data, val_data)
        assert len(history) == 2

    def test_history_has_correct_fields(self, train_data, val_data):
        model = BaselineTransformer(T_CFG)
        cfg   = TrainerConfig(epochs=1, log_every=0)
        metrics = Trainer(model, cfg).fit(train_data, val_data)[0]
        assert hasattr(metrics, "train_loss")
        assert hasattr(metrics, "val_loss")
        assert hasattr(metrics, "val_accuracy")
        assert 0.0 <= metrics.val_accuracy <= 1.0

    def test_ctm_trains_without_error(self, train_data, val_data):
        model = ContinuousThoughtModel(CTM_CFG)
        cfg   = TrainerConfig(epochs=2, log_every=0)
        history = Trainer(model, cfg).fit(train_data, val_data)
        assert len(history) == 2

    def test_same_config_same_init_loss(self, train_data, val_data):
        """Two models with same seed produce same initial train loss."""
        cfg = TrainerConfig(epochs=1, seed=7, log_every=0)
        m1 = BaselineTransformer(TransformerConfig())
        m2 = BaselineTransformer(TransformerConfig())
        # Seed both models identically
        torch.manual_seed(99)
        for p in m1.parameters():
            p.data = torch.randn_like(p)
        torch.manual_seed(99)
        for p in m2.parameters():
            p.data = torch.randn_like(p)
        h1 = Trainer(m1, cfg).fit(train_data, val_data)
        h2 = Trainer(m2, cfg).fit(train_data, val_data)
        assert h1[0].train_loss == pytest.approx(h2[0].train_loss, rel=1e-4)
