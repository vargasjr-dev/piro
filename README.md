# Piro

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
through a stateful model protocol. It intentionally does not pass these
episodes to the legacy single-call tensor trainer.

### Deploy to the platform

```bash
# Save your API key
piro login

# Push your model class
piro classes push <class-id> --file model.py

# Materialize the persistent-memory source
piro sources generate --source associative-recall

# The legacy tensor trainer remains available for sorting-sequences.
# Persistent-memory training requires the stateful runner described in
# docs/research-persistent-memory.md.
piro train --model my-model --data sorting-sequences --epochs 20

# Run the persistent-memory benchmark once a stateful model checkpoint exists
piro eval persistent-memory --model <model-id>
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
