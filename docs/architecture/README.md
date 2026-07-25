# Piro Architecture

This directory is the working architecture notebook for Piro. It is intentionally
incremental: each document should make one design decision easier to discuss,
without pretending that research ideas are already implemented.

## Current core direction

Piro’s first architecture is deliberately small:

```text
Observation
  -> Embed
  -> Predict next observed token/chunk
  -> Update fast weights
  -> Bind fast state with durable weights
  -> Output + updated fast state
  -> Consolidate and save durable weights
```

The core hypothesis is that a model with **fast, writable weights** and **slow,
durable weights** can learn online, personalize, and recover from distribution
shifts without requiring a specialized recurrent thought architecture.

The public API remains multimodal, but the first optimized training path is
text-first so next-token prediction provides a free causal learning signal.
Application session IDs and state-store keys belong to a serving adapter around
this model loop; they are not model inputs.

## CTM is a later exploration

Piro still contains a Continuous Thought Model (CTM) prototype and related
attention, synchronization, history, and adaptive-computation experiments. They
are preserved as research tracks, not treated as requirements of the core model.
We will revisit CTM only after the fast/slow self-updating baseline demonstrates
a real signal on online learning, persistent personalization, and distribution
shift recovery.

## Documents

- [Core self-updating model](./stateful-rl-first-model-v0.1.md) — the current
  pseudocode-first contract, with linked method-level detail in the application.
- [Borealis experiment](../../experiments/borealis/architectures/borealis/) — the
  current executable research implementation of the fast/slow model contract.
- [Diagram source](./stateful-rl-first-model-v0.1.mmd) — editable Mermaid source
  for the current core flow.
- [Oscillatory entrainment](../phase-4-oscillatory-entrainment.md) — deferred CTM
  exploration, not part of the baseline architecture.

## How to read the architecture

Read the pseudocode as the primary top-level contract. Method names identify the
smallest transformations needed to test the core hypothesis. The nested
application routes retain deeper CTM methods as exploratory references; their
presence does not make them part of the baseline.
