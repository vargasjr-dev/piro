"""Regression tests for Corona's dual-form causal mask.

The chunked dual-form readout originally multiplied (K^T Q) by ``tril``.
Because (K^T Q)[j, tau] pairs key position j with query position tau and
``tril[j, tau] = 1 iff j >= tau``, the mask kept FUTURE keys: every readout
could see reconstruction errors of tokens after it. Training loss collapsed
(corona-30k reached 0.019) while generation — which uses the causal primal
``step()`` — looped, because the training readout was not the one deployed.
"""

import torch

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
    )


def _logits_for(model: Corona, tokens: torch.Tensor) -> torch.Tensor:
    stream = model._embed_tokens(tokens)
    for block in model.blocks:
        stream = block.scan(stream)
    return model._logits(stream[:-1])


def test_scan_readout_cannot_see_future_tokens():
    """Perturbing token t must leave logits at positions < t untouched."""
    torch.manual_seed(0)
    model = Corona(_small_config())
    model.eval()
    with torch.no_grad():
        tokens = torch.randint(0, 257, (32,))
        base = _logits_for(model, tokens)
        for t in (10, 20, 31):
            perturbed = tokens.clone()
            perturbed[t] = (perturbed[t] + 7) % 257
            other = _logits_for(model, perturbed)
            assert torch.allclose(base[:t], other[:t], atol=1e-5), (
                f"logits before position {t} changed when token {t} changed — "
                "the dual-form readout is reading the future"
            )


def test_noise_training_stays_at_or_above_the_random_guess_floor():
    """On i.i.d. random tokens nothing about the next token is predictable,
    so loss must not drop meaningfully below ln(vocab). The transposed mask
    drove it well below the floor by copying future values."""
    import math

    torch.manual_seed(0)
    model = Corona(_small_config())
    vocab = 257
    floor = math.log(vocab)
    optimizer = torch.optim.Adam(model.parameters(), lr=3e-3)
    for _ in range(61):
        tokens = torch.randint(0, vocab, (128,))
        loss = model.training_loss(
            type("Example", (), {"inputs": ("".join(chr(32 + int(t) % 90) for t in tokens.tolist()),), "target": "", "metadata": {}})()
        )
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
    with torch.no_grad():
        fresh = torch.randint(0, vocab, (512,))
        final = float(
            torch.nn.functional.cross_entropy(_logits_for(model, fresh), fresh[1:])
        )
    assert final > floor - 0.15, (
        f"loss on random tokens reached {final:.3f}, below the ln({vocab}) "
        f"floor of {floor:.3f} — future information is leaking into the readout"
    )
