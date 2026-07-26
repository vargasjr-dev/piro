# Piro

Piro is a stateful model that learns as you use it, featuring weight updating during inference.

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
