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

The central architectural question for this notebook is what Piro is made of as
a stateful learner. Piro should combine multimodal input encoding, recurrent
thought dynamics, internal weight-based memory, and a learned mechanism that
updates those weights.

## Documents

- [Stateful RL-first model v0.1](./stateful-rl-first-model-v0.1.md) — first
  end-to-end diagram, with current CTM components separated from proposed
  online-learning components.
- [Diagram source](./stateful-rl-first-model-v0.1.mmd) — editable Mermaid source.

## How to read the diagram

The main diagram is a structural view of the model, not a timeline. Solid arrows
show the major interfaces between model components. Dashed boundaries show
modules that are part of Piro even though they operate on different internal
weight timescales.

The delayed-credit learning loop remains an important behavioral question, but it
is intentionally documented as a mechanism inside Piro rather than as a separate
“later consequence” input node.
