# Memory evaluation runbook

This runbook compares the fixed `MemorySuite` protocol across explicitly selected targets. The suite has ten deterministic ordered-sequence cases, resets model state between cases, scores exact normalized answers, and records per-case results plus token, duration, and cost metadata.

## Prepare the dataset

From the Piro repository root:

```bash
piro sources generate memory-suite
piro datasets list
```

Copy the dataset ID for the row whose source path is `sources/memory-suite/main.py`. The source generation worker should report 10 records; verify the generated records if needed:

```bash
piro dataset head <memory-suite-dataset-id>
```

## Gemma smoke test

Run Gemma alone first to validate endpoint readiness and the complete evaluation path:

```bash
piro benchmarks eval \
  --dataset <memory-suite-dataset-id> \
  --target gemma:google/gemma-3-270m
```

Track the run and inspect the per-case metadata:

```bash
piro evals list
piro evals get <evaluation-id>
```

The admin Evaluations detail page also shows the aggregate score, duration, cost accounting, token metadata, and expandable per-case results.

## Borealis comparison

After the completed Borealis model has persisted weights and is available for inference, use its model UUID as the second explicit target:

```bash
piro benchmarks eval \
  --dataset <memory-suite-dataset-id> \
  --target gemma:google/gemma-3-270m \
  --target <borealis-model-uuid>
```

Do not rely on implicit target discovery: the ordered target list is the comparison contract for each run. If a model is not ready, the run records an error result rather than silently substituting another model.

## Interpretation

Accuracy is the primary score: passed cases divided by ten. Latency and cost are reported separately and should be compared as operational metadata, not folded into the accuracy score. Use the case IDs and categories to identify whether a model fails on retention, binding, updates, interference, relations, capacity, or authority resolution.
