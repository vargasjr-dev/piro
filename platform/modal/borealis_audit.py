"""One-off direct audit of a published Borealis checkpoint."""

from __future__ import annotations

import io
import json
import os
from typing import Any

import modal

from _common import R2_BUCKET, image, piro_secrets, _r2_client

app = modal.App("piro-borealis-audit")
MODEL_ID = "bea4d410-42a6-4be9-83af-407f67bcb119"
TARGET_TOKEN = 288


def _top(logits, count: int = 10) -> list[dict[str, Any]]:
    values, ids = logits.topk(count)
    return [
        {"id": int(token_id), "logit": round(float(value), 6)}
        for value, token_id in zip(values.detach().cpu(), ids.detach().cpu())
    ]


def _stats(values) -> dict[str, float]:
    values = values.detach().float().cpu()
    return {
        "min": round(float(values.min()), 6),
        "max": round(float(values.max()), 6),
        "mean": round(float(values.mean()), 6),
        "std": round(float(values.std(unbiased=False)), 6),
        "l2": round(float(values.norm()), 6),
    }


def _token_info(tokenizer, token_id: int) -> dict[str, Any]:
    token_bytes = tokenizer._token_bytes.get(token_id)
    return {
        "id": token_id,
        "merge": list(tokenizer.merges[token_id - 256])
        if 256 <= token_id < 256 + len(tokenizer.merges)
        else None,
        "bytesHex": token_bytes.hex() if token_bytes is not None else None,
        "decoded": tokenizer.decode([token_id]),
    }


def _prompt_audit(model, text: str) -> dict[str, Any]:
    prompt = model._encode(text + model.config.target_prefix)
    with __import__("torch").no_grad():
        cold = model.prefill(prompt, adapt=False)
        warm = model.prefill(prompt, adapt=True)
        cold_logits = model.next_token_logits(cold)
        warm_logits = model.next_token_logits(warm)
        bias = warm.adaptation_state.output_bias

        masked = warm_logits.detach().clone()
        masked[TARGET_TOKEN] = -__import__("torch").inf
        masked_ids: list[int] = []
        state = warm
        for _ in range(8):
            logits = model.next_token_logits(state).detach().clone()
            logits[TARGET_TOKEN] = -__import__("torch").inf
            token = logits.argmax(dim=-1)
            masked_ids.append(int(token))
            state = model.advance_generation(state, token)

        generated, _ = model.generate_with_state(
            prompt, 8, model.initialize_adaptation_state(), adapt=True
        )

    def probability(logits, token_id: int) -> float:
        return round(float(__import__("torch").softmax(logits, dim=-1)[token_id]), 8)

    return {
        "text": text,
        "promptTokenIds": [int(x) for x in prompt.detach().cpu().tolist()],
        "coldTop": _top(cold_logits),
        "warmTop": _top(warm_logits),
        "token288": {
            "coldLogit": round(float(cold_logits[TARGET_TOKEN]), 6),
            "warmLogit": round(float(warm_logits[TARGET_TOKEN]), 6),
            "coldProbability": probability(cold_logits, TARGET_TOKEN),
            "warmProbability": probability(warm_logits, TARGET_TOKEN),
            "coldRank": int((cold_logits > cold_logits[TARGET_TOKEN]).sum()) + 1,
            "warmRank": int((warm_logits > warm_logits[TARGET_TOKEN]).sum()) + 1,
        },
        "warmBias": {
            "token288": round(float(bias[TARGET_TOKEN]), 6),
            "stats": _stats(bias),
            "nonZeroCount": int((bias != 0).sum()),
        },
        "warmEntropy": round(
            float((-(
                __import__("torch").softmax(warm_logits, dim=-1)
                * __import__("torch").log_softmax(warm_logits, dim=-1)
            )).sum()),
            6,
        ),
        "greedy8": [int(x) for x in generated.detach().cpu().tolist()],
        "greedy8Masked288": masked_ids,
    }


@app.function(image=image, secrets=[piro_secrets], timeout=300)
def audit(model_id: str = MODEL_ID) -> dict[str, Any]:
    import psycopg2
    import torch
    from architectures._common import load_architecture

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """
        SELECT m."weightsR2Key", tr."configJson", tr."architecturePath"
        FROM model m
        JOIN model_training_run mtr ON mtr."modelId" = m.id
        JOIN training_run tr ON tr.id = mtr."trainingRunId"
        WHERE m.id = %s
        """,
        (model_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        raise ValueError(f"model {model_id!r} not found")

    r2_prefix, config_json, architecture_path = row
    config = json.loads(config_json)
    r2 = _r2_client(os)
    response = r2.get_object(Bucket=R2_BUCKET, Key=f"{r2_prefix}/weights.pt")
    state = torch.load(io.BytesIO(response["Body"].read()), map_location="cpu", weights_only=True)
    architecture_class = load_architecture(architecture_path)
    model = architecture_class.from_config(config)
    model.load_model_state(state)
    model.eval()

    tokenizer = model.tokenizer
    embedding_row = model.token_embedding.weight[TARGET_TOKEN]
    output_bias = model.output_head.bias
    return {
        "modelId": model_id,
        "architecturePath": architecture_path,
        "config": {
            key: config.get(key)
            for key in (
                "vocab_size",
                "tokenizer_name",
                "target_prefix",
                "max_new_tokens",
                "embed_dim",
                "context_dim",
                "adaptation_learning_rate",
                "consolidation_rate",
                "eos_token_id",
            )
        },
        "token288": _token_info(tokenizer, TARGET_TOKEN),
        "parameters": {
            name: {
                "shape": list(value.shape),
                "dtype": str(value.dtype),
                "stats": _stats(value),
            }
            for name, value in state.items()
        },
        "token288Embedding": _stats(embedding_row),
        "outputBias": {
            "token288": round(float(output_bias[TARGET_TOKEN]), 6),
            "stats": _stats(output_bias),
            "maxIds": [
                int(x)
                for x in output_bias.topk(10).indices.detach().cpu().tolist()
            ],
        },
        "prompts": [_prompt_audit(model, text) for text in ("Hey", "How are you?", "a", "xyz", "The")],
    }


@app.local_entrypoint()
def main():
    print(json.dumps(audit.remote(), indent=2, sort_keys=True))
