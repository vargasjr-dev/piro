# Piro Architecture

This directory is the working architecture notebook for Piro. It is intentionally
incremental: each document should make one design decision easier to discuss,
without pretending that research ideas are already implemented.

## Current starting point

Piro currently has a **Continuous Thought Model (CTM)** prototype:

```text
input embeddings
  -> neuron state / history
  -> sync-driven attention
  -> repeated internal ticks
  -> output head
```

The central architectural question for this notebook is what happens **after an
action leaves the model**. Instead of requiring an immediate external verifier,
Piro should be able to preserve a prediction, observe later consequences, and
use the resulting prediction/value error to update the right earlier decisions.

## Documents

- [Stateful RL-first model v0.1](./stateful-rl-first-model-v0.1.md) — first
  end-to-end diagram, with current CTM components separated from proposed
  online-learning components.
- [Diagram source](./stateful-rl-first-model-v0.1.mmd) — editable Mermaid source.

## Status vocabulary

- **Implemented** — exists in the current repository prototype.
- **Designed** — an explicit Piro design direction, but not implemented yet.
- **Open** — a decision we should make through experiments rather than assume.

The diagram uses the same distinction visually. The goal is not to copy Kimi's
module inventory; it is to make Piro's unique loop visible:

```text
act -> predict -> encounter future consequences -> assign credit -> adapt
```
