# Piro Architecture

This directory is the working architecture notebook for Piro. It is intentionally
incremental: each document should make one design decision easier to discuss,
without pretending that research ideas are already implemented. The application’s
primary top-level architecture view is the linked pseudocode contract; diagrams
are secondary visual aids for future iterations.

## Current starting point

Piro currently has a **Continuous Thought Model (CTM)** prototype:

```text
input embeddings
  -> neuron state
  -> history buffer
  -> sync-driven attention
  -> repeated thought ticks
  -> output
```

The central architectural question for this notebook is what Piro is made of as
a stateful learner. Piro should combine multimodal input encoding, recurrent
thought dynamics, internal weight-based memory, and a learned mechanism that
updates those weights.

## Documents

- [Stateful RL-first model v0.1](./stateful-rl-first-model-v0.1.md) — the current
  pseudocode-first contract, with linked method-level detail in the application.
- [Diagram source](./stateful-rl-first-model-v0.1.mmd) — editable Mermaid source
  retained for a future secondary diagram view.

## How to read the architecture

Read the pseudocode as the primary top-level contract. Method names identify
transformations, and the values passed between them make state, history, inputs,
and learned weights explicit. The nested application routes provide the deeper
contract for each method.

The delayed-credit learning loop remains an important behavioral question, but it
is intentionally documented as a mechanism inside Piro rather than as a separate
“later consequence” input node.
