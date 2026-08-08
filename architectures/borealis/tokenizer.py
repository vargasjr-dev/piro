"""Reversible tokenizer boundary for Borealis language-model experiments."""

from __future__ import annotations

from collections.abc import Iterable

import tiktoken


class BorealisTokenizer:
    """Reversible frontier-style tokenizer selected by a persisted name."""

    def __init__(self, name: str = "o200k_base") -> None:
        self.name = name
        if name == "byte":
            self.encoding = None
        else:
            self.encoding = tiktoken.get_encoding(name)

    @property
    def vocab_size(self) -> int:
        if self.encoding is None:
            return 257
        return self.encoding.n_vocab

    @property
    def eos_token_id(self) -> int:
        if self.encoding is None:
            return 256
        return self.encoding.eot_token

    def encode(self, text: str) -> list[int]:
        """Encode text without allowing special-token injection."""
        if self.encoding is None:
            return list(text.encode("utf-8"))
        return self.encoding.encode_ordinary(text)

    def encode_training_text(self, text: str) -> list[int]:
        """Encode text and append the tokenizer's explicit end-of-text token."""
        return [*self.encode(text), self.eos_token_id]

    def decode(self, token_ids: Iterable[int]) -> str:
        """Decode token IDs back to text using the same tokenizer vocabulary."""
        values = [int(token_id) for token_id in token_ids]
        if self.encoding is None:
            return bytes(value for value in values if value != self.eos_token_id).decode(
                "utf-8", errors="replace"
            )
        return self.encoding.decode(values)

    def decode_generated(self, token_ids: Iterable[int]) -> str:
        """Decode generated IDs, stopping before the explicit EOS token."""
        visible_ids = []
        for token_id in token_ids:
            if int(token_id) == self.eos_token_id:
                break
            visible_ids.append(int(token_id))
        return self.decode(visible_ids)
