# Piro

Piro is Vargas's model research and operating repository. It defines our own
architectures, training sources, benchmarks, and Modal platform runtime.

## Repository layout

```text
architectures/  Our model implementations and shared architecture contracts
benchmarks/     Evaluation protocols and local research runners
sources/        Training/evaluation source generators
platform/       Modal deployment and platform orchestration
```

Hurricane-style names identify model architecture tracks. Shared architecture
development code lives under `architectures/_common`; it is internal to this
repository, not a general-purpose model-building framework.

## Train an architecture from the CLI

```bash
piro architecture train ctm \
  --dataset <dataset-id> \
  --max-steps 5000 \
  --name ashfall-ctm
```

Architecture paths resolve under `architectures/`, and datasets are generated
from the checked-in sources under `sources/`.

## Generate persistent-memory episodes locally

```python
from sources.associative_recall import generate_associative_recall_dataset

episodes = generate_associative_recall_dataset(1000, n_writes=(2, 6), delay=(4, 16), seed=0)
```

## Run benchmarks locally

```bash
uv run --extra dev python benchmarks/run.py --dry-run
uv run --extra dev python benchmarks/run_persistent_memory.py --episodes 200 --delay 8 --writes 3
```

## Deploy the Modal worker

```bash
modal deploy platform/modal_app.py
```
