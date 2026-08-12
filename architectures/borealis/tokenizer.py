"""Reversible byte-fallback BPE tokenizer for Borealis."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence

import tiktoken

BYTE_VOCAB_SIZE = 256
DEFAULT_MAX_VOCAB_SIZE = 8192


class BorealisTokenizer:
    """A persisted byte-fallback tokenizer with deterministic BPE merges.

    The byte tokens are the lossless fallback alphabet. Learned merge tokens are
    stored as pairs of previously-known token IDs, so the model configuration is
    sufficient to reconstruct the exact encoder and decoder during inference.
    """

    def __init__(
        self,
        name: str = "byte_bpe",
        merges: Sequence[Sequence[int]] | None = None,
    ) -> None:
        self.name = name
        if name == "byte":
            self.encoding = None
            self.merges: tuple[tuple[int, int], ...] = ()
            self._token_bytes = {token_id: bytes([token_id]) for token_id in range(256)}
            return
        if name == "o200k_base":
            self.encoding = tiktoken.get_encoding(name)
            self.merges = ()
            self._token_bytes = {}
            return
        if name != "byte_bpe":
            raise ValueError(f"unknown Borealis tokenizer {name!r}")

        self.encoding = None
        self.merges = tuple(self._normalize_merges(merges or ()))
        token_bytes = {token_id: bytes([token_id]) for token_id in range(BYTE_VOCAB_SIZE)}
        for offset, (left, right) in enumerate(self.merges, start=BYTE_VOCAB_SIZE):
            if left not in token_bytes or right not in token_bytes:
                raise ValueError("BPE merges must reference earlier vocabulary tokens")
            token_bytes[offset] = token_bytes[left] + token_bytes[right]
        self._token_bytes = token_bytes

    @staticmethod
    def _normalize_merges(merges: Sequence[Sequence[int]]) -> list[tuple[int, int]]:
        normalized: list[tuple[int, int]] = []
        for merge in merges:
            if len(merge) != 2:
                raise ValueError("each BPE merge must contain exactly two token IDs")
            left, right = (int(value) for value in merge)
            normalized.append((left, right))
        return normalized

    @classmethod
    def fit(
        cls,
        texts: Iterable[str],
        *,
        max_vocab_size: int = DEFAULT_MAX_VOCAB_SIZE,
    ) -> BorealisTokenizer:
        """Fit deterministic merges from raw text while retaining byte fallback."""
        if max_vocab_size <= BYTE_VOCAB_SIZE:
            raise ValueError("max_vocab_size must leave room for learned BPE tokens and EOS")

        sequences = [list(text.encode("utf-8")) for text in texts if text]
        merges: list[tuple[int, int]] = []
        while BYTE_VOCAB_SIZE + len(merges) + 1 < max_vocab_size:
            counts = Counter(
                pair
                for sequence in sequences
                for pair in zip(sequence, sequence[1:])
            )
            if not counts:
                break
            pair, count = min(counts.items(), key=lambda item: (-item[1], item[0]))
            if count < 2:
                break
            merges.append(pair)
            token_id = BYTE_VOCAB_SIZE + len(merges) - 1
            sequences = [cls._replace_pair(sequence, pair, token_id) for sequence in sequences]

        return cls("byte_bpe", merges)

    @staticmethod
    def _replace_pair(sequence: list[int], pair: tuple[int, int], token_id: int) -> list[int]:
        replaced: list[int] = []
        index = 0
        while index < len(sequence):
            if index + 1 < len(sequence) and (sequence[index], sequence[index + 1]) == pair:
                replaced.append(token_id)
                index += 2
            else:
                replaced.append(sequence[index])
                index += 1
        return replaced

    @property
    def vocab_size(self) -> int:
        if self.encoding is not None:
            return self.encoding.n_vocab
        if self.name == "byte":
            return 257
        return BYTE_VOCAB_SIZE + len(self.merges) + 1

    @property
    def eos_token_id(self) -> int:
        if self.encoding is not None:
            return self.encoding.eot_token
        if self.name == "byte":
            return 256
        return BYTE_VOCAB_SIZE + len(self.merges)

    def encode(self, text: str) -> list[int]:
        """Encode text with learned merges over a lossless UTF-8 byte stream."""
        if self.encoding is not None:
            return self.encoding.encode_ordinary(text)
        values = list(text.encode("utf-8"))
        if self.name == "byte":
            return values
        for token_id, pair in enumerate(self.merges, start=BYTE_VOCAB_SIZE):
            values = self._replace_pair(values, pair, token_id)
        return values

    def encode_training_text(self, text: str) -> list[int]:
        """Encode text and append the tokenizer's explicit end-of-text token."""
        return [*self.encode(text), self.eos_token_id]

    def decode(self, token_ids: Iterable[int]) -> str:
        """Decode token IDs back to text using the same tokenizer vocabulary."""
        if self.encoding is not None:
            return self.encoding.decode([int(token_id) for token_id in token_ids])
        output = bytearray()
        for token_id in token_ids:
            value = int(token_id)
            if value == self.eos_token_id:
                continue
            token_bytes = self._token_bytes.get(value)
            if token_bytes is not None:
                output.extend(token_bytes)
        return output.decode("utf-8", errors="replace")

    def decode_generated(self, token_ids: Iterable[int]) -> str:
        """Decode generated IDs, stopping before the explicit EOS token."""
        visible_ids = []
        for token_id in token_ids:
            if int(token_id) == self.eos_token_id:
                break
            visible_ids.append(int(token_id))
        return self.decode(visible_ids)
