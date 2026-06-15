"""Tests for model/layers/ — correlation, sync_attention, confidence_head,
tick_loop, output_head."""

import pytest
import torch

from model.layers.correlation import pearson_correlation
from model.layers.sync_attention import SyncAttention
from model.layers.confidence_head import ConfidenceHead
from model.layers.tick_loop import TickLoop, TickLoopLog
from model.layers.output_head import OutputHead


# ── pearson_correlation ───────────────────────────────────────────────────────

class TestPearsonCorrelation:
    def test_in_phase_returns_one(self):
        a = torch.tensor([1.0, 2.0, 3.0, 4.0])
        assert pearson_correlation(a, a).item() == pytest.approx(1.0, abs=1e-5)

    def test_out_of_phase_returns_neg_one(self):
        a = torch.tensor([1.0, 2.0, 3.0, 4.0])
        assert pearson_correlation(a, -a).item() == pytest.approx(-1.0, abs=1e-5)

    def test_independent_near_zero(self):
        torch.manual_seed(0)
        a = torch.tensor([1.0, -1.0, 1.0, -1.0])
        b = torch.tensor([1.0, 1.0, -1.0, -1.0])
        assert abs(pearson_correlation(a, b).item()) < 0.1

    def test_shape_mismatch_raises(self):
        with pytest.raises(ValueError, match="Shape mismatch"):
            pearson_correlation(torch.ones(3), torch.ones(4))

    def test_too_short_raises(self):
        with pytest.raises(ValueError):
            pearson_correlation(torch.tensor([1.0]), torch.tensor([1.0]))

    def test_output_in_minus_one_to_one(self):
        torch.manual_seed(42)
        a = torch.randn(8)
        b = torch.randn(8)
        r = pearson_correlation(a, b).item()
        assert -1.0 <= r <= 1.0


# ── SyncAttention ─────────────────────────────────────────────────────────────

class TestSyncAttention:
    @pytest.fixture
    def attn(self):
        return SyncAttention(n_neurons=4, embed_dim=8, query_dim=8, value_dim=4)

    def test_output_shape(self, attn):
        sync = torch.zeros(4, 4)
        emb = torch.randn(4, 8)
        out = attn(sync, emb)
        assert out.shape == (4, 4)  # (N, value_dim)

    def test_deterministic(self, attn):
        sync = torch.eye(4)
        emb = torch.randn(4, 8)
        assert torch.allclose(attn(sync, emb), attn(sync, emb))

    def test_compute_weights_sums_to_one(self, attn):
        sync = torch.eye(4)
        emb = torch.randn(4, 8)
        weights = attn.compute_weights(sync, emb)
        assert weights.sum().item() == pytest.approx(1.0, abs=1e-5)

    def test_compute_weights_shape(self, attn):
        sync = torch.zeros(4, 4)
        emb = torch.randn(4, 8)
        assert attn.compute_weights(sync, emb).shape == (4,)


# ── ConfidenceHead ────────────────────────────────────────────────────────────

class TestConfidenceHead:
    @pytest.fixture
    def head(self):
        return ConfidenceHead(n_neurons=4, hidden_dim=16)

    def test_output_in_zero_one(self, head):
        sync = torch.randn(4, 4)
        out = head(sync).item()
        assert 0.0 <= out <= 1.0

    def test_deterministic(self, head):
        sync = torch.ones(4, 4)
        assert head(sync).item() == pytest.approx(head(sync).item())

    def test_output_scalar(self, head):
        sync = torch.zeros(4, 4)
        assert head(sync).shape == torch.Size([])


# ── OutputHead ────────────────────────────────────────────────────────────────

class TestOutputHead:
    @pytest.fixture
    def head(self):
        return OutputHead(n_neurons=4, hidden_dim=16, n_classes=5)

    def test_output_shape(self, head):
        assert head(torch.randn(4, 4)).shape == (5,)

    def test_sums_to_one(self, head):
        probs = head(torch.randn(4, 4))
        assert probs.sum().item() == pytest.approx(1.0, abs=1e-5)

    def test_all_non_negative(self, head):
        probs = head(torch.randn(4, 4))
        assert (probs >= 0).all()

    def test_logits_shape(self, head):
        assert head.logits(torch.randn(4, 4)).shape == (5,)


# ── TickLoop ──────────────────────────────────────────────────────────────────

class TestTickLoop:
    @pytest.fixture
    def loop(self):
        attn = SyncAttention(n_neurons=4, embed_dim=8, query_dim=8, value_dim=8)
        conf = ConfidenceHead(n_neurons=4, hidden_dim=16)
        return TickLoop(attn, conf, max_ticks=10, confidence_threshold=0.9)

    def test_returns_three_values(self, loop):
        emb = torch.randn(4, 8)
        result = loop(emb)
        assert len(result) == 3

    def test_context_shape(self, loop):
        emb = torch.randn(4, 8)
        context, _, _ = loop(emb)
        assert context.shape == (4, 8)

    def test_sync_shape(self, loop):
        emb = torch.randn(4, 8)
        _, sync, _ = loop(emb)
        assert sync.shape == (4, 4)

    def test_log_type(self, loop):
        emb = torch.randn(4, 8)
        _, _, log = loop(emb)
        assert isinstance(log, TickLoopLog)

    def test_max_ticks_respected(self, loop):
        emb = torch.randn(4, 8)
        _, _, log = loop(emb)
        assert log.ticks_run <= 10

    def test_log_has_correct_max_ticks(self, loop):
        emb = torch.randn(4, 8)
        _, _, log = loop(emb)
        assert log.max_ticks == 10
