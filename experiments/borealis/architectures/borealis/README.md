# Borealis architecture

Borealis is a functional, text-first fast/slow self-updating model.

- Durable parameters embed token IDs and predict the next token.
- A run-local `BorealisFastState` adapts from causal prediction error.
- Each adaptation prediction binds durable weights with the current fast state.
- The final output head runs after the full input adaptation scan.
- The final output loss backpropagates into durable Borealis parameters.
- Fast state is returned explicitly and can be snapshotted or restored.
- Consolidation runs at every invocation boundary and produces the next durable revision.

This relocation preserves the existing implementation and tests. It does not
add Modal training or inference support: the current worker supports CTM,
CTM-10x, and the baseline transformer templates only.

## Validation

From the repository root:

```bash
uv run pytest experiments/borealis/architectures/borealis/tests
uv run ruff check experiments/borealis/architectures/borealis piro model
uv run pyright experiments/borealis/architectures/borealis piro model
```

The shared architecture design contract is documented at
`docs/architecture/stateful-rl-first-model-v0.1.md`.
