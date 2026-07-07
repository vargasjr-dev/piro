"""
benchmarks/models.py

Model adapters for benchmark evaluation.

All models — whether the student model or an external baseline — must satisfy
the `ModelProtocol`. This lets benchmarks be written once and run against any
model without branching.

Classes
-------
ModelProtocol
    typing.Protocol defining the interface every model must expose.
    Benchmarks only ever call `generate()`; nothing else is assumed.

GPTBaseline
    OpenAI API adapter.  Pass a model name string at construction; call
    `generate()` exactly like you would with the student model.  Used to
    establish human-level / frontier baselines for capability ledger entries.

Usage
-----
    from piro.benchmarks.models import GPTBaseline

    gpt = GPTBaseline("gpt-4o-mini")
    response = gpt.generate("What is 2 + 2?")

    # In a benchmark:
    class MyBenchmark(Benchmark):
        def run(self, model: ModelProtocol) -> BenchmarkResult:
            reply = model.generate(prompt)
            score = evaluate(reply)
            return self.result(score)

    result_student = MyBenchmark().run_timed(student_model)
    result_baseline = MyBenchmark().run_timed(GPTBaseline("gpt-4o"))
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any, Protocol, runtime_checkable

__all__ = ["ModelProtocol", "GPTBaseline"]

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"


@runtime_checkable
class ModelProtocol(Protocol):
    """
    Interface every model used in benchmarks must satisfy.

    Only `generate` is required.  The student model, GPTBaseline, and any
    future adapter (local GGUF, Anthropic, Modal endpoint) all implement this.

    Attributes
    ----------
    model_name:
        Human-readable identifier for logs and capability ledger entries.
    """

    model_name: str

    def generate(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        temperature: float = 0.2,
        system: str | None = None,
    ) -> str:
        """
        Generate a single text response for `prompt`.

        Parameters
        ----------
        prompt:
            The user-facing input.
        max_tokens:
            Hard cap on output tokens.  Benchmarks set this to keep costs
            predictable; keep default low enough for research budgets.
        temperature:
            Sampling temperature.  Use a low value (≤0.3) for deterministic
            benchmark runs so results are reproducible.
        system:
            Optional system prompt.  When None the model uses its default
            behaviour (or no system prompt for raw completions).

        Returns
        -------
        str
            The model's response text, stripped of leading/trailing whitespace.
        """
        ...


class GPTBaseline:
    """
    OpenAI Chat Completions adapter implementing ModelProtocol.

    Uses only stdlib (`urllib.request`, `json`) — no openai SDK required.
    The API key is read from the ``OPENAI_API_KEY`` environment variable at
    call time so the object is safe to construct without credentials present.

    Parameters
    ----------
    model_name:
        Any OpenAI chat model string, e.g. ``"gpt-4o-mini"``, ``"gpt-4o"``,
        ``"gpt-4o-2024-08-06"``.  Passed verbatim to the API.

    Examples
    --------
    >>> gpt = GPTBaseline("gpt-4o-mini")
    >>> gpt.generate("What is the capital of France?", max_tokens=32)
    'Paris.'

    >>> # Run the same benchmark against frontier and student models:
    >>> result_frontier = MyBenchmark().run_timed(GPTBaseline("gpt-4o"))
    >>> result_student  = MyBenchmark().run_timed(student_model)
    >>> print(result_frontier.score, result_student.score)
    """

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name

    def generate(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        temperature: float = 0.2,
        system: str | None = None,
    ) -> str:
        """Call the OpenAI Chat Completions API and return the assistant text."""
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "OPENAI_API_KEY is not set. "
                "Export it before running benchmarks against GPTBaseline."
            )

        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = json.dumps(
            {
                "model": self.model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
        ).encode()

        req = urllib.request.Request(
            OPENAI_API_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with urllib.request.urlopen(req) as resp:
            body: dict[str, Any] = json.loads(resp.read())

        try:
            return body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError) as exc:
            raise ValueError(
                f"Unexpected OpenAI response shape: {json.dumps(body)[:200]}"
            ) from exc

    def __repr__(self) -> str:
        return f"GPTBaseline({self.model_name!r})"
