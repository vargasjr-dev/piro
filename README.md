## Experiments, sources, and datasets

Piro research versions live under `experiments/<name>/`, using hurricane-style
alphabetic names. The first experiment is `ashfall`, with its benchmarks,
sources, and architectures kept together.

The CLI discovers sources in the current checkout and in the active connected
Piro repository:

```text
piro sources list
piro sources get <name-or-path>
piro sources generate <name-or-path>
piro datasets list
piro datasets get <dataset-id>
```

Local source discovery is read-only; generation always uses the active Piro
repository so generated artifacts are tracked by the platform.

# Piro

## Train an architecture from the CLI

Start a training run against a generated dataset owned by the active API key:

```bash
# `ctm` is the current research prototype entrypoint.
# The fast/slow baseline contract is documented under docs/architecture while
# its executable training entrypoint is being built.
piro architecture train ctm \
  --dataset <dataset-id> \
  --max-steps 5000 \
  --name ashfall-ctm
```

The architecture argument is a repository architecture name. Bare names resolve
under `architectures/`; experiment-scoped paths can be passed explicitly, such
as `experiments/ashfall/architectures/ctm`. `--dataset` is required so a run
never silently trains against the wrong generated artifact.

The command returns the queued training-run ID. Use `piro datasets get <id>`
to inspect the dataset and the web application to follow run progress.

> Open source model development framework, built on PyTorch.

Piro is to PyTorch what Next.js is to React — a framework that gives you structure, conventions, and a platform to deploy to.

## Install

```bash
pip install trainpiro
```

## Quick Start

### Define a model

```python
from piro import PiroModel
from piro.schema import ArchitectureGraph, GraphNode, GraphEdge

class MyModel(PiroModel):
    name = "My Model"
    slug = "my-model"
    description = "A tiny model for sequence classification."
    module = "my_model"
    hyper_parameters = {"embed_dim": 8, "n_classes": 5}

    @classmethod
    def serialize_graph(cls) -> ArchitectureGraph | None:
        return ArchitectureGraph(
            nodes=[
                GraphNode(id="input", type="io", label="Input"),
                GraphNode(id="output", type="io", label="Output"),
            ],
            edges=[GraphEdge(**{"from": "input", "to": "output"})],
        )

    def __init__(self, embed_dim=8, n_classes=5):
        super().__init__()
        self.linear = torch.nn.Linear(embed_dim, n_classes)

    def forward(self, embeddings):
        return self.linear(embeddings)
```

### Generate persistent-memory episodes locally

```python
from piro.data.associative_recall import generate_associative_recall_dataset

episodes = generate_associative_recall_dataset(1000, n_writes=(2, 6), delay=(4, 16), seed=0)
episode = episodes[0]
print(episode.write_prompt)
print(episode.distractor_prompt)
print(episode.query_prompt, "→", episode.answer)
```

The persistent-memory benchmark sends those prompts as separate invocations
through a stateful model protocol. The Modal training worker uses the same
write, distractor, and query boundaries when the dataset is
`associative-recall`.

### Deploy to the platform

Create a stateful deployment record for one of your models. Runtime placement
(for example, assigning an H100) is intentionally not part of this command yet.
Admins can pass `--admin` to publish an admin/global deployment.

```bash
# Save your API key
piro login

# Push your model class
piro classes push <class-id> --file model.py

# Generate the repository-defined source from the Piro source page
# (the source lives at sources/associative-recall/main.py)

# Train an architecture through the platform CLI.
piro architecture train ctm --dataset <dataset-id> --max-steps 5000

# Create a private deployment for a model owned by the current API key.
piro models deploy <model-id>

# Admins can create a shared/global deployment.
piro models deploy <model-id> --admin

# Run the dedicated stateful persistent-memory benchmark
python model/run_persistent_memory.py --episodes 200 --delay 8 --writes 3
```

## Package Layout

```
piro/
├── __init__.py          # PiroModel, Trainer, TrainerConfig, schema types
├── base.py              # PiroModel — base class for all models
├── schema.py            # ModelManifest, ArchitectureGraph, GraphNode, GraphEdge
├── trainer.py           # Trainer + TrainerConfig — training loop
├── client.py            # PiroClient — platform API client
├── cli.py               # piro CLI (train, deploy, eval, infer, ...)
├── input.py             # PiroInput — base class for model inputs
├── layer.py             # PiroLayer — base class for serializable layers
├── data/
│   ├── associative_recall.py # Persistent WRITE / DISTRACT / QUERY episodes
│   └── sequences.py          # Sorting task data generation
└── benchmarks/
    ├── base.py          # Benchmark, BenchmarkResult
    ├── models.py        # GPTBaseline, ModelProtocol
    ├── persistent_memory.py
    ├── ood_generalization.py
    └── adaptive_compute.py
```

## License

MIT
