"""Compatibility exports for the canonical model/data memory generator."""

from model.data.associative_recall import (
    MemoryEpisode,
    MemoryFact,
    generate_associative_recall_dataset,
    make_memory_episode,
)

__all__ = [
    "MemoryEpisode",
    "MemoryFact",
    "generate_associative_recall_dataset",
    "make_memory_episode",
]
