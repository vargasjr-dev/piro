import torch

from architectures.ashfall import main as ashfall_main
from architectures.ashfall.ctm_10x import ContinuousThoughtModel, CTMConfig
from architectures.borealis import main as borealis_main
from architectures.borealis.model import Borealis, BorealisConfig


def test_ashfall_entrypoint_loads_and_invokes_structured_input():
    config = {
        **CTMConfig(
            n_neurons=2,
            embed_dim=4,
            query_dim=4,
            value_dim=4,
            hidden_dim=6,
            n_classes=3,
        ).__dict__,
        "template": "ctm",
    }
    source = ContinuousThoughtModel(CTMConfig(**{key: value for key, value in config.items() if key != "template"}))
    model = ashfall_main.load_model(config, source.state_dict())

    result = ashfall_main.invoke(
        model,
        {"parts": [{"type": "text", "text": "color=blue"}]},
    )

    assert result["text"] == "ACK"
    assert isinstance(result["state"], dict)


def test_borealis_entrypoint_loads_and_invokes_structured_input():
    config = BorealisConfig(vocab_size=8, embed_dim=4, hidden_dim=6)
    source = Borealis(config)
    model = borealis_main.load_model(config.__dict__, source.state_dict())

    result = borealis_main.invoke(
        model,
        {"parts": [{"type": "text", "text": "hello"}]},
    )

    assert result["text"].isdigit()
    assert 0 <= int(result["text"]) < config.vocab_size
    assert result["state"] == {"output_bias": [0.0] * config.vocab_size, "updates": 0, "loss_ema": None}


def test_entrypoints_return_json_safe_state():
    config = CTMConfig(n_neurons=2, embed_dim=4, query_dim=4, value_dim=4, hidden_dim=6, n_classes=3)
    model = ashfall_main.load_model(config.__dict__, ContinuousThoughtModel(config).state_dict())
    result = ashfall_main.invoke(
        model,
        {"parts": [{"type": "text", "text": "key=value"}]},
    )

    assert isinstance(result["state"]["history_entries"], list)
    assert all(isinstance(entry, list) for entry in result["state"]["history_entries"])
    assert not any(isinstance(value, torch.Tensor) for value in result["state"]["history_entries"])
