"""Ashfall-owned training runtime for the generic Modal runner."""

from __future__ import annotations

import re
from dataclasses import asdict
from typing import Any

import torch
import torch.nn.functional as F

from architectures._common.runtime import EvaluationResult
from architectures._common.encoding import memory_embedding, policy_embedding
from architectures._common.trainer import TrainerConfig
from architectures.ashfall.ctm_10x import ContinuousThoughtModel, CTMConfig
from sources._common.training import Example, load_source_examples


class AshfallTrainingRuntime:
    batch_size = 32

    def __init__(self, *, source_path: str, device: torch.device, seed: int) -> None:
        self.source_path = source_path
        self.device = device
        self.seed = seed
        self._policy_mode = "owner-policy-worlds" in source_path
        self._sorting_mode = "sequences" in source_path
        self.config_value = self._make_config()
        self.model = ContinuousThoughtModel(self.config_value).to(device)
        self.model.reset()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-3, weight_decay=1e-4)
        self.trainer_config = TrainerConfig(seed=seed, batch_size=self.batch_size)

    def _make_config(self) -> CTMConfig:
        if self._sorting_mode:
            return CTMConfig(
                n_neurons=4,
                embed_dim=8,
                query_dim=8,
                value_dim=8,
                hidden_dim=16,
                n_classes=5,
            )
        if self._policy_mode:
            return CTMConfig(
                n_neurons=6,
                embed_dim=16,
                query_dim=16,
                value_dim=16,
                hidden_dim=88,
                n_classes=32,
            )
        return CTMConfig(
            n_neurons=4,
            embed_dim=8,
            query_dim=8,
            value_dim=8,
            hidden_dim=16,
            n_classes=32,
        )

    def config(self) -> dict[str, Any]:
        return {"template": "ctm-10x", **asdict(self.config_value)}

    def load_dataset(self, *, r2_client, bucket, source_path, dataset_prefix, split, limit):
        return load_source_examples(
            source_path=source_path,
            r2_client=r2_client,
            bucket=bucket,
            prefix=dataset_prefix,
            split=split,
            limit=limit,
        )

    def _example_loss(self, example: Example, *, train_mode: bool):
        self.model.reset()
        if self._sorting_mode:
            return self._sorting_prediction(example, train_mode=train_mode)
        embed = policy_embedding if self._policy_mode else memory_embedding
        observations = example.inputs[:-1]
        query = example.inputs[-1]
        parameter = next(self.model.parameters())
        for packet in observations:
            for observation in str(packet).splitlines():
                if not observation.strip():
                    continue
                self.model(
                    embed(
                        observation,
                        self.config_value.embed_dim,
                        torch_module=torch,
                        dtype=parameter.dtype,
                        device=parameter.device,
                    ),
                    preserve_graph=train_mode,
                )
        query_text = str(query) if self._policy_mode else f"QUERY:{query}"
        output = self.model(
            embed(
                query_text,
                self.config_value.embed_dim,
                torch_module=torch,
                dtype=parameter.dtype,
                device=parameter.device,
            ),
            preserve_graph=train_mode,
        )
        logits = output.logits if hasattr(output, "logits") else output
        target = int(example.target) if self._policy_mode else int(str(example.target).removeprefix("value_"))
        loss = F.cross_entropy(logits.unsqueeze(0), torch.tensor([target], device=logits.device))
        return logits, target, loss

    def _sorting_prediction(self, example: Example, *, train_mode: bool):
        text = str(example.inputs[0])
        numbers = [int(value) for value in re.findall(r"\d+", text)]
        numbers = numbers[-self.config_value.n_neurons :]
        if len(numbers) != self.config_value.n_neurons:
            raise ValueError("sorting examples must contain exactly four numbers")
        embeddings = torch.zeros(
            self.config_value.n_neurons,
            self.config_value.embed_dim,
            device=self.device,
        )
        for index, value in enumerate(numbers):
            embeddings[index, min(value, self.config_value.embed_dim - 1)] = 1.0
        output = self.model(embeddings, preserve_graph=train_mode)
        logits = output.logits if hasattr(output, "logits") else output
        target = numbers.index(min(numbers))
        loss = F.cross_entropy(logits.unsqueeze(0), torch.tensor([target], device=logits.device))
        return logits, target, loss

    def train_step(self, batch: list[Example], *, step: int) -> float:
        del step
        self.model.train()
        self.optimizer.zero_grad()
        losses = [self._example_loss(example, train_mode=True)[2] for example in batch]
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
                logits, target, loss = self._example_loss(example, train_mode=False)
                total_loss += float(loss.detach())
                correct += int(int(logits.argmax().item()) == target)
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
        self.model.reset()

    def parameter_count(self) -> int:
        return sum(parameter.numel() for parameter in self.model.parameters())

    def checkpoint_state(self) -> dict[str, Any]:
        return {}

    def load_checkpoint_state(self, state: dict[str, Any]) -> None:
        del state


def create_training_runtime(*, source_path: str, device: torch.device, seed: int):
    return AshfallTrainingRuntime(source_path=source_path, device=device, seed=seed)
