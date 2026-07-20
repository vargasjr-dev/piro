"""Compatibility exports for the persistent-memory benchmark."""

from model.benchmarks.persistent_memory import (
    PersistentMemoryBenchmark,
    StatefulMemoryModel,
    default,
)

__all__ = ["PersistentMemoryBenchmark", "StatefulMemoryModel", "default"]
