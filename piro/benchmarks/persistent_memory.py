"""Compatibility exports for the persistent-memory benchmark."""

from model.benchmarks.persistent_memory import (
    CTMStatefulMemoryAdapter,
    PersistentMemoryBenchmark,
    StatefulMemoryModel,
    default,
)

__all__ = ["CTMStatefulMemoryAdapter", "PersistentMemoryBenchmark", "StatefulMemoryModel", "default"]
