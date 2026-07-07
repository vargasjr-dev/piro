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

### Train locally

```python
from piro import Trainer, TrainerConfig
from piro.data.counter import generate_counter_dataset

train = generate_counter_dataset(n=1000, length=(2, 8), seed=0, split="train")
val = generate_counter_dataset(n=200, length=(2, 8), seed=1, split="val")

model = MyModel()
history = Trainer(model, TrainerConfig(epochs=20, lr=1e-3)).fit(train, val)
```

### Deploy to the platform

```bash
# Save your API key
piro login

# Push your model class
piro classes push <class-id> --file model.py

# Launch a training run
piro train --model my-model --data counter-sequences --epochs 20

# Run benchmarks
piro eval length-generalization --model <model-id>

# Run inference
piro infer <model-id> --prompt "INC DEC INC INC DEC"
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
│   ├── counter.py       # Counter task data generation
│   └── sequences.py     # Sorting task data generation
└── benchmarks/
    ├── base.py          # Benchmark, BenchmarkResult
    ├── models.py        # GPTBaseline, ModelProtocol
    ├── length_generalization.py
    ├── ood_generalization.py
    └── adaptive_compute.py
```

## License

MIT
