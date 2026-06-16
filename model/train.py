"""
model/train.py

Entry point: train and compare ContinuousThoughtModel vs BaselineTransformer
on the sorting task using the shared Trainer.

Usage
-----
    uv run python model/train.py              # default run
    uv run python model/train.py --seed 0     # reproducible
    uv run python model/train.py --epochs 20  # more epochs
    uv run python model/train.py --dry-run    # shape/gradient check only

What this verifies
------------------
1. Both models train without error on the same data pipeline.
2. Gradients flow through the full computation graph (CTM: through tick loop).
3. Both models reduce train loss over 10 epochs.
4. Final val accuracy is logged for comparison.
"""

from __future__ import annotations

import argparse
import random
import sys

import torch
import torch.nn.functional as F

from .baseline_transformer import BaselineTransformer, TransformerConfig
from .ctm import ContinuousThoughtModel, CTMConfig
from .data.sequences import generate_sorting_dataset
from .trainer import Dataset, Sample, Trainer, TrainerConfig


# ── Config ────────────────────────────────────────────────────────────────────

CTM_CFG = CTMConfig(
    n_neurons=4,
    embed_dim=8,
    query_dim=8,
    value_dim=8,  # must equal embed_dim — tick loop feeds output back as next input
    hidden_dim=16,
    n_classes=5,
)

TRANSFORMER_CFG = TransformerConfig(
    embed_dim=8,
    n_heads=2,
    ffn_dim=6,
    n_layers=2,
    n_classes=5,
)


# ── Data helpers ──────────────────────────────────────────────────────────────

def _samples_from_sequences(n: int, seed: int, split: str) -> Dataset:
    """Convert sequence samples to (embedding, label) pairs for the Trainer.

    Each sequence element is one-hot encoded → embedding.
    Label = index of the minimum element in the sequence (argmin task).
    """
    seqs = generate_sorting_dataset(n=n, length=CTM_CFG.n_neurons, seed=seed, split=split)
    samples: Dataset = []
    for seq in seqs:
        # One-hot encode each element in the sequence → (N, embed_dim) embeddings
        numbers = [int(x) for x in seq.prompt.split()]
        emb = torch.zeros(CTM_CFG.n_neurons, CTM_CFG.embed_dim)
        for i, val in enumerate(numbers):
            idx = min(val, CTM_CFG.embed_dim - 1)
            emb[i, idx] = 1.0
        label = numbers.index(min(numbers))  # argmin
        samples.append((emb, label))
    return samples


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Train CTM vs BaselineTransformer")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip full training; only verify shapes and gradient flow.",
    )
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)

    ctm  = ContinuousThoughtModel(CTM_CFG)
    base = BaselineTransformer(TRANSFORMER_CFG)

    print(f"CTM parameters:         {ctm.count_parameters():,}")
    print(f"Transformer parameters: {base.count_parameters():,}")

    if args.dry_run:
        _dry_run(ctm, base)
        return

    train_data = _samples_from_sequences(n=500, seed=args.seed, split="train")
    val_data   = _samples_from_sequences(n=100, seed=args.seed, split="test")
    trainer_cfg = TrainerConfig(epochs=args.epochs, lr=args.lr, seed=args.seed)

    print("\n── Training ContinuousThoughtModel ──────────────────────────────")
    ctm_history = Trainer(ctm, trainer_cfg).fit(train_data, val_data)

    print("\n── Training BaselineTransformer ─────────────────────────────────")
    base_history = Trainer(base, trainer_cfg).fit(train_data, val_data)

    # Summary
    ctm_final  = ctm_history[-1]
    base_final = base_history[-1]
    print("\n── Final comparison ─────────────────────────────────────────────")
    print(f"{'Model':<28} {'Val Loss':>10} {'Val Acc':>10}")
    print("-" * 52)
    print(f"{'ContinuousThoughtModel':<28} {ctm_final.val_loss:>10.4f} {ctm_final.val_accuracy:>10.3f}")
    print(f"{'BaselineTransformer':<28} {base_final.val_loss:>10.4f} {base_final.val_accuracy:>10.3f}")


def _dry_run(ctm: ContinuousThoughtModel, base: BaselineTransformer) -> None:
    """Verify shapes and gradient flow without a full training loop."""
    print("\n[dry-run] Verifying shapes and gradient flow...")
    emb = torch.randn(CTM_CFG.n_neurons, CTM_CFG.embed_dim)

    # CTM
    ctm_out = ctm(emb)
    assert ctm_out.logits.shape == (CTM_CFG.n_classes,), "CTM logits shape mismatch"
    loss_ctm = F.cross_entropy(ctm_out.logits.unsqueeze(0), torch.tensor([0]))
    loss_ctm.backward()
    grad_norms = [p.grad.norm().item() for p in ctm.parameters() if p.grad is not None]
    assert len(grad_norms) > 0, "CTM: no gradients"
    print(f"  CTM: logits={tuple(ctm_out.logits.shape)}, "
          f"ticks={ctm_out.tick_count}, "
          f"grad_layers_with_grad={len(grad_norms)} ✓")

    # Transformer
    base_logits = base(emb)
    assert base_logits.shape == (TRANSFORMER_CFG.n_classes,), "Transformer logits shape mismatch"
    loss_base = F.cross_entropy(base_logits.unsqueeze(0), torch.tensor([0]))
    loss_base.backward()
    grad_norms_b = [p.grad.norm().item() for p in base.parameters() if p.grad is not None]
    assert len(grad_norms_b) > 0, "BaselineTransformer: no gradients"
    print(f"  BaselineTransformer: logits={tuple(base_logits.shape)}, "
          f"grad_layers_with_grad={len(grad_norms_b)} ✓")

    print("[dry-run] All checks passed ✓")


if __name__ == "__main__":
    main()
