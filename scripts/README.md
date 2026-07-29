# Experimental Borealis probes

This directory contains local research probes that are not production
benchmarks. Keep the probe PRs explicitly marked **DO NOT MERGE** until the
measurement design and results have been reviewed.

## Owner-policy probe

Run from the repository root:

```bash
PYTHONPATH=. python3 scripts/borealis-owner-policy-probe.py \
  --eval-per-owner 8 \
  --teaching-examples 8
```

The script compares frozen, run-local adapted, and consolidated Borealis on
held-out owner-policy cases. It starts from a fresh random model by default,
so its output validates the measurement path rather than claiming useful
trained-model performance.
