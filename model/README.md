# Piro model research

This directory is the canonical Python research implementation. The current
`ContinuousThoughtModel` is a retained research prototype, not a commitment that
CTM belongs in Piro’s first production architecture. The baseline architecture
question is simpler: can fast, writable weights plus slow durable weights produce
useful online learning and personalization? The web app
and platform are supporting infrastructure; model hypotheses, state behavior,
training, and experiments belong here.

## Canonical modules

- `borealis.py` — functional text-first fast/slow self-updating model with
  causal next-token prediction, explicit fast-state snapshots, and deliberate consolidation.
- `ctm.py` — deferred Continuous Thought Model experiment with neuron MLPs,
  rolling history, synchrony, burst state, optional oscillators, and Oja plasticity.
- `baseline_transformer.py` — matched fixed-depth transformer baseline.
- `data/associative_recall.py` — deterministic WRITE / DISTRACT / QUERY episodes.
- `benchmarks/persistent_memory.py` — retained, reset, and serialized-state recall evaluation.
- `trainer.py` — shared supervised training loop.

## Persistent-memory experiment

See `docs/research-persistent-memory.md` for the falsifiable WRITE / DISTRACT / QUERY protocol and required controls.

## Borealis fast/slow model contract

`Borealis` follows `docs/architecture/stateful-rl-first-model-v0.1.md`. Durable
PyTorch parameters produce causal next-token logits, while `BorealisFastState`
contains a run-local output-bias update. `run()` returns predictions, the causal
loss, and the next fast state. `snapshot_fast_state()` and `load_fast_state()`
keep storage outside the model. `consolidate_weights()` is explicit and only
consumes fast state when `weight_persistence_policy()` says evidence is stable.

## Stateful model contract

`ContinuousThoughtModel` keeps working state on the model instance. Ordinary
parameters are updated by backpropagation during training. When plasticity is
enabled, the fast recurrent matrix updates during inference and persists until
`reset()` or until the process is replaced. Use `snapshot_state()` and
`load_state()` to make that state durable outside the process.

```python
model = ContinuousThoughtModel()
model.reset()
output = model(sequence_embeddings)
saved = model.snapshot_state()
# Later, on the same or another model instance:
model.load_state(saved)
```

The reset boundary is explicit so experiments can distinguish stateless,
within-sequence, and persistent-episode behavior. The persistent-memory task
never concatenates the write and query prompts: the query only succeeds if the
model retained or restored state from the write episode.

## Validation

```bash
uv run pytest model/tests
uv run ruff check model piro
```
