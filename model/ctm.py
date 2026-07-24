"""Continuous Thought Model and its stateful research components.

The Python implementation is the canonical research model.  It mirrors the
former TypeScript reference while making the state boundary explicit:

* trainable parameters are updated by backpropagation;
* working state (history, burst counters, oscillator phases) persists on the
  model instance until ``reset``;
* plastic recurrent weights update locally during inference when enabled;
* ``snapshot_state``/``load_state`` make that fast state serializable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from piro import PiroModel
from piro.schema import ArchitectureGraph, GraphEdge, GraphNode


ActivationName = Literal["relu", "sigmoid", "tanh"]


@dataclass
class CTMConfig:
    n_neurons: int = 4
    embed_dim: int = 8
    query_dim: int = 8
    value_dim: int = 8
    hidden_dim: int = 16
    n_classes: int = 5
    window_size: int = 8
    max_ticks: int = 10
    confidence_threshold: float = 0.9
    activation: ActivationName = "relu"
    enable_burst: bool = False
    enable_plasticity: bool = False
    enable_oscillation: bool = False


@dataclass
class BurstConfig:
    max_burst_length: int = 5
    burst_threshold: float = 0.6
    burst_decay: float = 0.85
    refractory_period: int = 2


@dataclass
class PlasticConfig:
    learning_rate: float = 0.01
    weight_decay: float = 0.001
    warmup_plastic: bool = False
    max_weight: float = 1.0
    warmup_ticks: int = 1


@dataclass
class OscillatorConfig:
    coupling_strength: float = 0.05
    damping: float = 0.0
    dt: float = 0.1
    frequencies: Optional[tuple[float, ...]] = None


@dataclass
class DendriteConfig:
    num_compartments: int = 4
    compartment_size: float = 0.25
    spike_threshold: float = 0.5
    soma_mode: Literal["count", "weighted", "hybrid"] = "count"


class NeuronLayer(nn.Module):
    """N independent two-layer MLP neurons, matching the TS architecture."""

    def __init__(self, n_neurons: int, input_dim: int, hidden_dim: int,
                 activation: ActivationName = "relu") -> None:
        super().__init__()
        self.n_neurons = n_neurons
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.activation_name = activation
        self.w0 = nn.Parameter(torch.empty(n_neurons, input_dim, hidden_dim))
        self.b0 = nn.Parameter(torch.zeros(n_neurons, hidden_dim))
        self.w1 = nn.Parameter(torch.empty(n_neurons, hidden_dim))
        self.b1 = nn.Parameter(torch.zeros(n_neurons))
        nn.init.xavier_uniform_(self.w0)
        nn.init.xavier_uniform_(self.w1.unsqueeze(-1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.reshape(-1)
        if x.numel() != self.input_dim:
            raise ValueError(f"expected input dimension {self.input_dim}, got {x.numel()}")
        hidden = torch.einsum("d,ndh->nh", x, self.w0) + self.b0
        if self.activation_name == "relu":
            hidden = F.relu(hidden)
        elif self.activation_name == "sigmoid":
            hidden = torch.sigmoid(hidden)
        else:
            hidden = torch.tanh(hidden)
        return (hidden * self.w1).sum(dim=-1) + self.b1


class NeuronHistory:
    """Rolling activation history with graph-safe sequence boundaries.

    Existing state is detached at the beginning of each invocation, while
    activations produced during the current invocation retain their autograd
    graph so the neuron layer remains trainable.
    """

    def __init__(self, n_neurons: int, window_size: int) -> None:
        self.n_neurons = n_neurons
        self.window_size = window_size
        self.entries: list[torch.Tensor] = []

    @property
    def size(self) -> int:
        return len(self.entries)

    @property
    def is_warm(self) -> bool:
        return len(self.entries) >= self.window_size

    def begin_invocation(self) -> None:
        """Detach retained state before building a new autograd graph."""
        self.entries = [entry.detach().clone() for entry in self.entries[-self.window_size :]]

    def push(self, activations: torch.Tensor) -> None:
        if activations.numel() != self.n_neurons:
            raise ValueError("activation size does not match history")
        self.entries.append(activations.reshape(-1))
        if len(self.entries) > self.window_size:
            self.entries.pop(0)

    def matrix(self) -> torch.Tensor:
        if not self.entries:
            return torch.empty(self.n_neurons, 0)
        return torch.stack(self.entries, dim=0).T.contiguous()

    def latest(self) -> torch.Tensor:
        if not self.entries:
            return torch.zeros(self.n_neurons)
        return self.entries[-1].detach().clone()

    def clear(self) -> None:
        self.entries.clear()


def correlation_matrix(activations: torch.Tensor) -> torch.Tensor:
    """Pearson correlation across rows, with zero-variance rows mapped to zero."""
    if activations.ndim != 2:
        raise ValueError("activations must have shape [neurons, timesteps]")
    if activations.shape[1] < 2:
        return torch.eye(activations.shape[0], dtype=activations.dtype, device=activations.device)
    centered = activations - activations.mean(dim=1, keepdim=True)
    denom = centered.norm(dim=1, keepdim=True).clamp_min(1e-8)
    normalized = centered / denom
    return (normalized @ normalized.T).clamp(-1.0, 1.0)


class SyncAttention(nn.Module):
    def __init__(self, n_neurons: int, embed_dim: int, query_dim: int, value_dim: int) -> None:
        super().__init__()
        sync_dim = n_neurons * n_neurons
        self.query = nn.Linear(sync_dim, query_dim, bias=False)
        self.key = nn.Linear(embed_dim, query_dim, bias=False)
        self.value = nn.Linear(embed_dim, value_dim, bias=False)
        self.scale = query_dim ** -0.5

    def forward(self, sync: torch.Tensor, embeddings: torch.Tensor) -> torch.Tensor:
        if embeddings.ndim == 1:
            embeddings = embeddings.unsqueeze(0)
        query = self.query(sync.reshape(1, -1))
        keys = self.key(embeddings)
        values = self.value(embeddings)
        weights = torch.softmax((query @ keys.T).squeeze(0) * self.scale, dim=-1)
        return weights @ values


class BurstState:
    def __init__(self, config: BurstConfig, n_neurons: int, device: torch.device | None = None) -> None:
        self.config = config
        self.burst_counter = torch.zeros(n_neurons, dtype=torch.long, device=device)
        self.refractory_counter = torch.zeros(n_neurons, dtype=torch.long, device=device)

    def tick(self, activations: torch.Tensor) -> None:
        for i, value in enumerate(activations.detach().cpu()):
            if self.refractory_counter[i] > 0:
                self.refractory_counter[i] -= 1
            elif float(value) >= self.config.burst_threshold:
                self.burst_counter[i] = min(self.config.max_burst_length, self.burst_counter[i] + 1)
            elif self.burst_counter[i] > 0:
                self.burst_counter[i] = 0
                self.refractory_counter[i] = self.config.refractory_period

    def weighting(self, activations: torch.Tensor, boost_factor: float = 0.5) -> torch.Tensor:
        out = activations.clone()
        for i in range(len(out)):
            if self.burst_counter[i] > 0:
                progress = float(self.burst_counter[i]) / self.config.max_burst_length
                boost = 1.0 + boost_factor * (1.0 - progress * (1.0 - self.config.burst_decay))
                out[i] = torch.clamp(out[i] * boost, max=1.0)
        return out

    def sync_weighting(self, sync: torch.Tensor, boost_factor: float = 0.3) -> torch.Tensor:
        out = sync.clone()
        bursting = self.burst_counter > 0
        for i in range(out.shape[0]):
            for j in range(out.shape[1]):
                if bursting[i] or bursting[j]:
                    progress_i = float(self.burst_counter[i]) / self.config.max_burst_length if bursting[i] else 0.0
                    progress_j = float(self.burst_counter[j]) / self.config.max_burst_length if bursting[j] else 0.0
                    boost = 1.0 + boost_factor * max(
                        1.0 - progress_i * (1.0 - self.config.burst_decay),
                        1.0 - progress_j * (1.0 - self.config.burst_decay),
                    )
                    out[i, j] = torch.clamp(out[i, j] * boost, -1.0, 1.0)
        return out

    def reset(self) -> None:
        self.burst_counter.zero_()
        self.refractory_counter.zero_()


class PlasticSynapse:
    """Inference-time Oja plasticity, persisted by the owning CTM instance."""

    def __init__(self, config: PlasticConfig, n_neurons: int, device: torch.device | None = None) -> None:
        self.config = config
        self.weights = torch.empty(n_neurons, n_neurons, device=device).uniform_(-0.01, 0.01)
        self.ticks_since_reset = 0

    def apply(self, activations: torch.Tensor, previous: torch.Tensor) -> torch.Tensor:
        recurrent = self.weights @ previous.detach()
        return torch.clamp(activations + recurrent, -self.config.max_weight, self.config.max_weight)

    def update(self, activations: torch.Tensor, previous: torch.Tensor) -> None:
        self.ticks_since_reset += 1
        if self.ticks_since_reset <= self.config.warmup_ticks:
            return
        with torch.no_grad():
            a = activations.detach()
            p = previous.detach()
            delta = self.config.learning_rate * (a[:, None] * p[None, :] - self.weights * a[:, None].square())
            delta -= self.config.weight_decay * self.weights
            self.weights.add_(delta).clamp_(-self.config.max_weight, self.config.max_weight)

    @property
    def energy(self) -> float:
        return float(self.weights.square().sum().sqrt())

    def snapshot(self) -> torch.Tensor:
        return self.weights.clone()

    def load(self, weights: torch.Tensor) -> None:
        if weights.shape != self.weights.shape:
            raise ValueError("plastic state shape does not match model")
        self.weights.copy_(weights)

    def reset(self) -> None:
        self.weights.uniform_(-0.01, 0.01)
        self.ticks_since_reset = 0


class OscillatorBank:
    def __init__(self, config: OscillatorConfig, n_neurons: int, device: torch.device | None = None) -> None:
        self.config = config
        self.n_neurons = n_neurons
        self.phases = torch.zeros(n_neurons, device=device)
        if config.frequencies is None:
            self.frequencies = torch.ones(n_neurons, device=device)
        else:
            self.frequencies = torch.tensor(config.frequencies, device=device)
        self.coupling = torch.full((n_neurons, n_neurons), config.coupling_strength / max(n_neurons, 1), device=device)
        self.coupling.fill_diagonal_(0.0)

    def step(self, currents: torch.Tensor) -> torch.Tensor:
        phase_diff = self.phases.unsqueeze(0) - self.phases.unsqueeze(1)
        coupling = (self.coupling * torch.sin(phase_diff)).sum(dim=1)
        self.phases.add_(self.config.dt * (self.frequencies + coupling + currents.detach() - self.config.damping * self.phases))
        self.phases.remainder_(2 * torch.pi)
        return self.gates()

    def gates(self) -> torch.Tensor:
        return (torch.sin(self.phases) + 1.0) / 2.0

    def synchrony_index(self) -> float:
        diff = self.phases[:, None] - self.phases[None, :]
        mask = ~torch.eye(self.n_neurons, dtype=torch.bool, device=self.phases.device)
        return float(torch.cos(diff)[mask].mean()) if mask.any() else 1.0

    def reset(self) -> None:
        self.phases.zero_()


@dataclass
class CTMState:
    history: NeuronHistory
    burst: Optional[BurstState]
    plastic: Optional[PlasticSynapse]
    oscillator: Optional[OscillatorBank]
    previous_activations: Optional[torch.Tensor] = None


@dataclass
class TickLog:
    ticks_run: int
    max_ticks: int
    converged: bool
    confidence: float
    confidence_threshold: float


@dataclass
class CTMOutput:
    logits: torch.Tensor
    probs: torch.Tensor
    confidence: float
    tick_count: int
    log: TickLog
    state: CTMState


class ContinuousThoughtModel(PiroModel):
    name = "Continuous Thought Model"
    slug = "ctm"
    description = "Stateful iterative tick-loop model with synchronization, burst dynamics, and optional plasticity."
    module = "ctm"

    hyper_parameters = {**CTMConfig().__dict__}

    @classmethod
    def serialize_graph(cls) -> Optional[ArchitectureGraph]:
        hp = cls.hyper_parameters
        return ArchitectureGraph(
            nodes=[
                GraphNode(id="input", type="io", label="Input", detail=f"embedding × {hp['embed_dim']}"),
                GraphNode(id="neurons", type="ffn", label="Neuron Layer", detail=f"{hp['n_neurons']} independent MLPs"),
                GraphNode(id="history", type="sync", label="Persistent History", detail=f"rolling window {hp['window_size']}"),
                GraphNode(id="loop", type="loop", label="Adaptive Tick Loop", detail=f"max {hp['max_ticks']} ticks"),
                GraphNode(id="plastic", type="sync", label="Plastic Synapse", detail="optional Oja updates"),
                GraphNode(id="output", type="io", label="Output", detail=f"{hp['n_classes']} logits"),
            ],
            edges=[
                GraphEdge(**{"from": "input", "to": "neurons"}),
                GraphEdge(**{"from": "neurons", "to": "history"}),
                GraphEdge(**{"from": "history", "to": "loop"}),
                GraphEdge(**{"from": "loop", "to": "plastic"}),
                GraphEdge(**{"from": "plastic", "to": "output"}),
            ],
        )

    def __init__(self, config: CTMConfig | None = None, **kwargs: Any) -> None:
        super().__init__()
        cfg = config or CTMConfig(**kwargs)
        if cfg.value_dim != cfg.embed_dim:
            raise ValueError("value_dim must equal embed_dim for the feedback loop")
        self.config = cfg
        self.n_neurons = cfg.n_neurons
        self.embed_dim = cfg.embed_dim
        self.window_size = cfg.window_size
        self.max_ticks = cfg.max_ticks
        self.confidence_threshold = cfg.confidence_threshold
        self.neurons = NeuronLayer(cfg.n_neurons, cfg.embed_dim, cfg.hidden_dim, cfg.activation)
        self.attention = SyncAttention(cfg.n_neurons, cfg.embed_dim, cfg.query_dim, cfg.value_dim)
        sync_dim = cfg.n_neurons * cfg.n_neurons
        self.confidence_head = nn.Sequential(nn.Linear(sync_dim, cfg.hidden_dim), nn.ReLU(), nn.Linear(cfg.hidden_dim, 1), nn.Sigmoid())
        self.output_head = nn.Sequential(nn.Linear(sync_dim, cfg.hidden_dim), nn.ReLU(), nn.Linear(cfg.hidden_dim, cfg.n_classes))
        self.burst_config = BurstConfig() if cfg.enable_burst else None
        self.plastic_config = PlasticConfig() if cfg.enable_plasticity else None
        self.oscillator_config = OscillatorConfig() if cfg.enable_oscillation else None
        self._state = self._new_state()

    def _new_state(self) -> CTMState:
        device = next(self.parameters()).device
        return CTMState(
            history=NeuronHistory(self.n_neurons, self.window_size),
            burst=BurstState(self.burst_config, self.n_neurons, device=device) if self.burst_config else None,
            plastic=PlasticSynapse(self.plastic_config, self.n_neurons, device=device) if self.plastic_config else None,
            oscillator=OscillatorBank(self.oscillator_config, self.n_neurons, device=device) if self.oscillator_config else None,
        )

    @property
    def state(self) -> CTMState:
        return self._state

    def reset(self) -> None:
        self._state = self._new_state()

    def snapshot_state(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "previous_activations": (
                self._state.previous_activations.detach().clone()
                if self._state.previous_activations is not None
                else None
            )
        }
        if self._state.plastic:
            result["plastic_weights"] = self._state.plastic.snapshot()
            result["plastic_ticks"] = self._state.plastic.ticks_since_reset
        result["history_entries"] = [entry.detach().clone() for entry in self._state.history.entries]
        if self._state.burst:
            result["burst_counter"] = self._state.burst.burst_counter.clone()
            result["refractory_counter"] = self._state.burst.refractory_counter.clone()
        if self._state.oscillator:
            result["phases"] = self._state.oscillator.phases.clone()
        return result

    def load_state(self, snapshot: dict[str, Any]) -> None:
        entries = snapshot.get("history_entries", [])
        self._state.history.entries = [entry.detach().clone() for entry in entries]
        previous = snapshot.get("previous_activations")
        self._state.previous_activations = previous.detach().clone() if previous is not None else None
        if self._state.plastic and "plastic_weights" in snapshot:
            self._state.plastic.load(snapshot["plastic_weights"])
            self._state.plastic.ticks_since_reset = int(snapshot.get("plastic_ticks", 0))
        if self._state.burst:
            self._state.burst.burst_counter.copy_(snapshot["burst_counter"])
            self._state.burst.refractory_counter.copy_(snapshot["refractory_counter"])
        if self._state.oscillator and "phases" in snapshot:
            self._state.oscillator.phases.copy_(snapshot["phases"])

    def _activation(self, current_input: torch.Tensor, *, preserve_graph: bool = False) -> torch.Tensor:
        activations = self.neurons(current_input)
        if self._state.plastic and self._state.previous_activations is not None:
            activations = self._state.plastic.apply(activations, self._state.previous_activations)
            self._state.plastic.update(activations, self._state.previous_activations)
        if self._state.oscillator:
            activations = activations * self._state.oscillator.step(activations)
        if self._state.burst:
            self._state.burst.tick(activations)
            activations = self._state.burst.weighting(activations)
        self._state.previous_activations = (
            activations if preserve_graph else activations.detach().clone()
        )
        self._state.history.push(activations)
        return activations

    def forward(
        self,
        embeddings: torch.Tensor,
        *,
        reset: bool = False,
        preserve_graph: bool = False,
    ) -> CTMOutput:
        if reset:
            self.reset()
        elif not preserve_graph:
            self._state.history.begin_invocation()
            if self._state.previous_activations is not None:
                self._state.previous_activations = self._state.previous_activations.detach().clone()
        if embeddings.ndim == 1:
            embeddings = embeddings.unsqueeze(0)
        if embeddings.ndim != 2 or embeddings.shape[1] != self.embed_dim:
            raise ValueError(f"expected [sequence, {self.embed_dim}] embeddings")
        current_input = embeddings[0]
        for row in embeddings:
            current_input = row
            self._activation(current_input, preserve_graph=preserve_graph)
        while not self._state.history.is_warm:
            self._activation(current_input, preserve_graph=preserve_graph)

        confidence = torch.tensor(0.0, device=embeddings.device)
        converged = False
        ticks_run = 0
        sync = correlation_matrix(self._state.history.matrix().to(embeddings.device))
        for tick in range(self.max_ticks):
            ticks_run = tick + 1
            if self._state.burst:
                sync = self._state.burst.sync_weighting(sync)
            context = self.attention(sync, current_input)
            sync = correlation_matrix(self._state.history.matrix().to(embeddings.device))
            confidence = self.confidence_head(sync.reshape(1, -1)).squeeze()
            self._activation(context, preserve_graph=preserve_graph)
            current_input = context
            if float(confidence) >= self.confidence_threshold:
                converged = True
                break
        logits = self.output_head(sync.reshape(1, -1)).squeeze(0)
        probs = torch.softmax(logits, dim=-1)
        log = TickLog(ticks_run, self.max_ticks, converged, float(confidence), self.confidence_threshold)
        return CTMOutput(logits, probs, log.confidence, ticks_run, log, self._state)

