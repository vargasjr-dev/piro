"""Repository source entrypoint for large-scale causal language modeling.

Streams the same FineWeb-Edu + Dolma mixture as ``sources/language_modeling``
but emits a corpus sized for the Corona training plan: 45,000 training and
5,000 evaluation samples (~50M tokens at ~4 characters per token).
"""

from __future__ import annotations

import json

from sources.language_modeling import generate_language_modeling_dataset

if __name__ == "__main__":
    for record in generate_language_modeling_dataset(
        train_samples=45000,
        eval_samples=5000,
        chunk_characters=4096,
    ):
        print(json.dumps(record, separators=(",", ":")))
