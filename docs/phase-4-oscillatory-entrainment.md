# Phase 4 — Oscillatory Entrainment

> **Design doc — July 6, 2026**
> Author: VargasJR

## Problem

Biological brains don't just fire — they _oscillate_. Cortical neurons exhibit
rhythmic activity across theta (4–8 Hz), alpha (8–12 Hz), beta (12–30 Hz), and
gamma (30–80 Hz) bands. These oscillations synchronize across populations,
creating transient assemblies that bind features, gate information flow, and
enable sequence learning through phase precession.

The current Python CTM treats each neuron as an independent MLP with
history-based correlation. There is no intrinsic timing — no rhythm, no phase,
no entrainment. Information is encoded purely in firing rates, not in the
_relative timing_ of spikes. This is a significant biological gap.

## Goal

Add intrinsic oscillatory dynamics to each neuron so that:

1. **Neurons oscillate** at learned or fixed frequencies
2. **Phase-locking** emerges naturally through synaptic coupling
3. **Information** can be encoded in phase relationships (not just rates)
4. **Theta sequences** compress experience into timed reactivation

## Architecture

### 1. Oscillator — `model/ctm.py` (`OscillatorBank`)

Each neuron gets a damped harmonic oscillator that modulates its excitability:

```
d²θ/dt² + γ·dθ/dt + ω²·θ = I(t)   ← driven by input current
```

Where:

- `θ` = phase angle [0, 2π)
- `ω` = intrinsic frequency (learned per neuron)
- `γ` = damping coefficient (learned or fixed)
- `I(t)` = input current from other neurons + external input

The oscillator produces a **gating signal** `g(t) = (sin(θ) + 1) / 2` that
multiplies the neuron's activation — a neuron near its preferred phase fires
more easily.

**Interface:**

```typescript
interface OscillatorConfig {
  /** Per-neuron frequencies (rad/tick) — learned or fixed */
  frequencies?: number[];
  /** Damping coefficient (default 0.1) */
  damping?: number;
  /** Coupling strength between oscillators (default 0.05) */
  couplingStrength?: number;
}

class OscillatorBank {
  constructor(config: OscillatorConfig, numNeurons: number);

  /** Advance all oscillators one tick given input currents */
  step(inputCurrents: Float64Array, dt: number): void;

  /** Get current gating signals [0, 1] for each neuron */
  getGates(): Float64Array;

  /** Get current phases [0, 2π) for each neuron */
  getPhases(): Float64Array;

  /** Synchrony measure: mean pairwise cosine of phase differences */
  synchronyIndex(): number;
}
```

### 2. Kuramoto Coupling

Neurons couple through a **Kuramoto-style** phase interaction:

```
dθ_i/dt = ω_i + (κ/N) · Σ_j sin(θ_j - θ_i)
```

This is the simplest model that produces spontaneous synchronization.
When coupling strength `κ` exceeds a critical threshold, oscillators with
nearby frequencies lock phases — forming a **transient assembly**.

A learned coupling matrix `W_couple[N×N]` replaces the uniform `κ/N`, so
which neurons entrain together is learned, not hard-coded:

```
dθ_i/dt = ω_i + Σ_j W_couple[i][j] · sin(θ_j - θ_i)
```

### 3. Integration with CTM Tick Loop

The oscillator bank sits alongside the existing NeuronLayer, history buffer,
and SyncAttention. At each tick:

```
1. NeuronLayer.forward(embedding)        → raw activations [N]
2. OscillatorBank.step(inputCurrents)    → gates [0, 1]
3. activations *= gates                  → gated activations
4. NeuronHistory.push(gatedActivations)  → rolling window
5. correlationMatrix(window)             → syncMatrix [N×N]
6. SyncAttention.forward(syncMatrix, embedding) → context
   (optionally modulated by synchronyIndex)
7. PlasticSynapse.step(gatedActivations) → plastic recurrent weights
```

The key: **oscillation gates what the neuron contributes** to the sync matrix
and downstream computation. A neuron at its trough is effectively silent.

### 4. Theta Sequence Compression

One of the most powerful biological mechanisms: during theta oscillations,
place cells (or here, "concept neurons") fire in a compressed sequence that
replays experience. We can emulate this by:

- Using the phase of a **global theta oscillator** (θ_theata ≈ 0.1 rad/tick)
- Each neuron fires at a preferred theta phase (its "theta phase precession")
- The order of firing encodes a learned sequence
- This enables the model to **predict the next item** in a sequence before
  it happens — useful for benchmarks like sorting or counting

### 5. New CTMConfig Options

```typescript
interface CTMConfig {
  // ... existing fields ...

  /** Oscillator configuration. undefined = no oscillation (backward compatible). */
  oscillatorConfig?: OscillatorConfig;

  /**
   * If true, use oscillatory gating in the forward pass.
   * When false (or config absent), behavior is identical to Phase 3.
   */
  enableOscillation?: boolean;

  /**
   * Theta precession config. When set, neurons learn preferred theta phases
   * and the model can do sequence compression.
   */
  thetaPrecession?: {
    /** Global theta frequency (default 0.1) */
    thetaFreq: number;
    /** Whether phases are learned per-neuron or hard-coded */
    learnedPhases: boolean;
  };
}
```

## Example: Sorting 4 Numbers

With oscillation enabled, a CTM trained on sorting might evolve:

- **Neuron 0** (fast oscillator, ω=2π/3): fires early, detects the minimum
- **Neuron 1** (medium oscillator, ω=2π/5): fires mid-sequence
- **Neuron 2** (slow oscillator, ω=2π/7): fires late, holds the result

The phase relationship encodes _where in the sort_ each neuron contributes,
not just _whether_ it fires.

## Implementation Plan

### Step 1: `oscillator.ts` + tests (~150 LOC)

The core oscillator bank with Kuramoto coupling. Pure math, no CTM dependency.

### Step 2: Gate integration in CTM forward pass (~80 LOC)

Modify `ContinuousThoughtModel.forward()` to apply oscillatory gating when `oscillatorConfig` is set.

### Step 3: Plastic coupling weights (~100 LOC)

Add a trainable coupling pathway alongside `OscillatorBank` as a learned parameter, updated via Oja's rule alongside
the plastic synapse weights.

### Step 4: Theta precession (~120 LOC)

Add global theta oscillator, per-neuron preferred phases, and sequence
compression in `generate()`.

### Step 5: Benchmark integration (~40 LOC)

Update the Python benchmark adapters to pass through oscillator state for analysis.

## Open Questions

1. **Frequency initialization** — should frequencies be learned from scratch
   or initialized in biologically plausible bands (theta/alpha/beta/gamma)?

2. **Coupling matrix shape** — full N×N is expensive for large N. Should we
   use a low-rank factorization or sparse coupling?

3. **Backprop through oscillation** — the oscillator `step()` is differentiable
   (sin/cos). But for RL-based training we may not need gradients through it.

4. **Relationship to BurstState** — Phase 1's BurstState modulates activation
   amplitude. Oscillation modulates phase. Do they compose? (Yes — burst
   modulates _how much_, oscillation modulates _when_.)

## References

- Kuramoto, Y. (1984). _Chemical Oscillations, Waves, and Turbulence._
- Lisman, J. & Jensen, O. (2013). "The θ-γ neural code." _Neuron_, 77(6).
- Buzsáki, G. (2002). "Theta oscillations in the hippocampus." _Neuron_, 33(3).
- O'Keefe, J. & Recce, M.L. (1993). "Phase relationship between hippocampal
  place units and the EEG theta rhythm." _Hippocampus_, 3(3).
