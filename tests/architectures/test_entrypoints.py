import torch

from architectures._common import load_architecture
from architectures.ashfall.ctm_10x import Ashfall, CTMConfig
from architectures.borealis.model import Borealis, BorealisConfig


def test_ashfall_entrypoint_exposes_the_model_class_and_invokes_structured_input():
    config = CTMConfig(
        n_neurons=2,
        embed_dim=4,
        query_dim=4,
        value_dim=4,
        hidden_dim=6,
        n_classes=3,
    )
    model = Ashfall(config)
    architecture = load_architecture("architectures/ashfall/main.py")
    assert architecture is Ashfall
    result = model.invoke({"parts": [{"type": "text", "text": "color=blue"}]})
    assert result["text"] == "ACK"
    assert isinstance(result["state"], dict)


def test_borealis_entrypoint_exposes_the_model_class_and_invokes_structured_input():
    config = BorealisConfig(vocab_size=8, embed_dim=4, context_dim=6)
    model = Borealis(config)
    architecture = load_architecture("architectures/borealis/main.py")
    assert architecture is Borealis
    result = model.invoke({"parts": [{"type": "text", "text": "hello"}]})
    assert result["text"].isdigit()
    assert 0 <= int(result["text"]) < config.vocab_size
    assert result["state"] == {"output_bias": [0.0] * config.vocab_size, "updates": 0, "loss_ema": None}


def test_model_invocation_returns_json_safe_state():
    config = CTMConfig(n_neurons=2, embed_dim=4, query_dim=4, value_dim=4, hidden_dim=6, n_classes=3)
    model = Ashfall(config)
    result = model.invoke(
        {"parts": [{"type": "text", "text": "key=value"}]},
    )

    assert isinstance(result["state"]["history_entries"], list)
    assert all(isinstance(entry, list) for entry in result["state"]["history_entries"])
    assert not any(isinstance(value, torch.Tensor) for value in result["state"]["history_entries"])
