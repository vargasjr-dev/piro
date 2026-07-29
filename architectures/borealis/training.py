"""Borealis-owned training runtime for the generic Modal runner."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

import torch
import torch.nn.functional as F

from architectures._common.runtime import EvaluationResult
from architectures.borealis.model import Borealis, BorealisConfig
from sources._common.training import Example, load_source_examples


class BorealisTrainingRuntime:
    batch_size = 16

    def __init__(self, *, source_path: str, device: torch.device, seed: int) -> None:
        del source_path
        self.device = device
        self.seed = seed
        self.config_value = BorealisConfig()
        self.model = Borealis(self.config_value).to(device)
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-3, weight_decay=1e-4)

    def config(self) -> dict[str, Any]:
        return asdict(self.config_value)

    def load_dataset(self, *, r2_client, bucket, source_path, dataset_prefix, split, limit):
        return load_source_examples(
            source_path=source_path,
            r2_client=r2_client,
            bucket=bucket,
            prefix=dataset_prefix,
            split=split,
            limit=limit,
        )

    def _tokens(self, example: Example) -> torch.Tensor:
        prompt = "\n".join(str(value) for value in example.inputs)
        text = f"{prompt}\nANSWER:{example.target}"
        values = [byte % self.config_value.vocab_size for byte in text.encode("utf-8")]
        if len(values) < 2:
            values.append(0)
        return torch.tensor(values, dtype=torch.long, device=self.device)

    def _loss_and_prediction(self, example: Example):
        tokens = self._tokens(example)
        logits = self.model.run(tokens, adapt=False)
        target = tokens[-1]
        loss = F.cross_entropy(logits.unsqueeze(0), target.unsqueeze(0))
        return logits, target, loss

    def train_step(self, batch: list[Example], *, step: int) -> float:
        del step
        self.model.train()
        self.optimizer.zero_grad()
        losses = [self._loss_and_prediction(example)[2] for example in batch]
        loss = torch.stack(losses).mean()
        loss.backward()
        self.optimizer.step()
        return float(loss.detach())

    def evaluate(self, data: list[Example]) -> EvaluationResult:
        self.model.eval()
        total_loss = 0.0
        correct = 0
        with torch.no_grad():
            for example in data:
                logits, target, loss = self._loss_and_prediction(example)
                total_loss += float(loss.detach())
                correct += int(int(logits.argmax().item()) == int(target.item()))
        count = max(1, len(data))
        return EvaluationResult(total_loss / count, correct / count)

    def optimizer_state(self):
        return self.optimizer.state_dict()

    def load_optimizer_state(self, state) -> None:
        self.optimizer.load_state_dict(state)

    def restore_optimizer_device(self, device) -> None:
        for state in self.optimizer.state.values():
            for key, value in state.items():
                if hasattr(value, "to"):
                    state[key] = value.to(device)

    def model_state(self) -> dict[str, Any]:
        return self.model.state_dict()

    def load_model_state(self, state: dict[str, Any]) -> None:
        self.model.load_state_dict(state)

    def parameter_count(self) -> int:
        return sum(parameter.numel() for parameter in self.model.parameters())

    def checkpoint_state(self) -> dict[str, Any]:
        return {}

    def load_checkpoint_state(self, state: dict[str, Any]) -> None:
        del state


def create_training_runtime(*, source_path: str, device: torch.device, seed: int):
    return BorealisTrainingRuntime(source_path=source_path, device=device, seed=seed)
