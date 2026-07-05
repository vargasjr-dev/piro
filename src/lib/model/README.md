# Piro Model Architecture — TypeScript Primitives

These files implement the core architectural primitives for the Piro model — a
biologically-inspired, RL-first architecture built from scratch (not transformer-derived).

## Roadmap

Per VISION.md, the seven-phase architecture roadmap progresses through:

| Phase | Behavior | Status |
|---|---|---|---|
| 0 | Firing rate + Spike timing → CTM primitives | ✅ **Complete** (45 tests) |
| 1 | Burst patterns | ✅ **Complete** (burst-state.ts, burst-weighted sync matrix) |
| 2 | Hebbian plasticity | ✅ **Complete** (plastic-synapse.ts, Oja's rule, consolidation API) |
| 3 | Dendritic spikes | ✅ **Complete** (dendrite.ts, 23 tests, multi-compartment neurons) |
| 4 | Oscillatory entrainment | 🎯 **Next** |
| 5 | Neuromodulation | Hard |

Phase 0 builds the Continuous Thought Machine (CTM) foundation: per-neuron history,
synchronization matrix as representation, and adaptive tick-based computation.
**Phase 0 is complete.** All modules built and tested.

## Files

### `dendrite.ts`
Multi-compartment dendritic spike neurons (Phase 3). Each neuron has C
independent compartments, each with its own learned weights and input mask.
Compartments fire all-or-nothing spikes; the soma sums spikes (count,
weighted, or hybrid with NeuronLayer output). Adds sub-neural computation
and coincidence detection. ~2.3K params at default config (64 neurons, 4
compartments each).

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

### `neuron-history.ts`
Rolling window of past activations per neuron (W timesteps).
- `push(activations)` — appends latest activation vector, drops oldest
- `toActivationMatrix()` — extracts [N × W] buffer in neuron-major order,
  ready for correlationMatrix()
- Handles the circular buffer wrap-around so the matrix always has the
  correct temporal order regardless of push count

### `neuron-layer.ts`
N independent 2-layer MLPs — one tiny learned network per neuron.
- Each neuron has its own W0, b0, W1, b1 (no weight sharing)
- Supports ReLU, sigmoid, or tanh hidden activation
- `getParams()` / `setParams()` for serialization
- Xavier initialization via seeded Box-Muller RNG
- ~N × (H(D+1) + H + 1) parameters

### `ctm.ts`
The CTM orchestrator — runs the full adaptive-tick inference loop.
1. **Warm-up:** fills NeuronHistory by feeding through NeuronLayer
2. **Adaptive ticks:** compute sync matrix → SyncAttention → check entropy →
   if confident, emit; otherwise feed context back as next input
3. **Fallback:** classify from final state if max ticks reached
- Configurable: numNeurons, inputDim, hiddenDim, windowSize, maxTicks,
  confidenceThreshold, numClasses
- ~4K params (64-neuron default) — tiny enough to train in-browser

## How They Connect

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
- `neuron-history.test.ts` — 8 tests: bounds, warm/cold state, circular
  buffer wrap, toActivationMatrix shape, getLatest, clear
- `neuron-layer.test.ts` — 10 tests: validation, shape, determinism, seeds,
  activations (relu/sigmoid/tanh), param serialization
- `dendrite.test.ts` — 23 tests: compartment spike/no-spike, input masking,
  soma modes (count/weighted/hybrid), layer determinism, spike rate tracking,
  param count, CTM pipeline compatibility
- `ctm.test.ts` — 8 tests: constructor, forward shape, determinism, reset,
  per-tick steps, entropy convergence, param count, early exit
