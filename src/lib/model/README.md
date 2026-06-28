# Piro Model Architecture — TypeScript Primitives

These files implement the core architectural primitives for the Piro model — a
biologically-inspired, RL-first architecture built from scratch (not transformer-derived).

## Roadmap

Per VISION.md, the seven-phase architecture roadmap progresses through:

| Phase | Behavior | Status |
|---|---|---|
| 0 | Firing rate + Spike timing → CTM primitives | 🎯 **Here** |
| 1 | Burst patterns | Next |
| 2 | Hebbian plasticity | Critical for personalization |
| 3 | Dendritic spikes | Medium-term |
| 4 | Oscillatory entrainment | Hard |
| 5 | Neuromodulation | Hard |

Phase 0 builds the Continuous Thought Machine (CTM) foundation: per-neuron history,
synchronization matrix as representation, and adaptive tick-based computation.

## Files

### `linalg.ts`
Pure-TypeScript linear algebra for model layers. Zero dependencies.
- `matVec` — matrix-vector multiply
- `dot`, `add`, `scale` — vector operations
- `softmax` — numerically stable softmax
- `flatten` — row-major 2-D → 1-D

### `correlation.ts`
Pairwise neuron correlation — the synchronization primitive.
- `pearsonCorrelation(a, b)` — returns [-1, 1] for two activation sequences
- `correlationMatrix(activations)` — builds N×N symmetric matrix from
  an [N × timesteps] buffer; the diagonal is always 1.0

The sync matrix is the core representation in the CTM architecture — unlike
a transformer's attention patterns (which attend to *input positions*), the
sync matrix captures *which neurons are firing together*. It is a representation
of the model's own internal state.

### `sync-attention.ts`
Cross-attention from the sync matrix to the input embedding.
- Query = W_q · flatten(syncMatrix) — "what state am I in?"
- Key   = W_k · embedding           — "what does the input say?"
- Value = W_v · embedding           — "what should I carry forward?"

This answers: *given my current synchronization state, which part of the
input should I focus on next?* It is the mechanism by which internal
model state gates external input processing.

## How They Connect

In the full CTM forward pass (still to be built in subsequent phases):

```
input embedding
      ↓
NeuronLayer (N private MLPs, each with history buffer)
      → next_activations[N]
      ↓  (append to rolling history)
NeuronHistory (rolling window of size W)
      → activations[N × W]
      ↓
correlationMatrix(activations)
      → syncMatrix[N × N]
      ↓
SyncAttention.forward(syncMatrix, embedding)
      → context vector
      ↓
[repeat: attend → update neurons → recompute sync → check confidence]
      ↓  (when confidence exceeds threshold or max ticks reached)
OutputHead(syncMatrix)
      → class distribution
```

## Tests

Run with `bun test src/lib/model`:

- `correlation.test.ts` — 12+ tests: in-phase, out-of-phase, independent,
  edge cases (constant, length mismatch, single element), correlationMatrix
- `sync-attention.test.ts` — 7 tests: output shape, determinism, seeded
  reproducibility, uniform-attention property, sync matrix sensitivity
