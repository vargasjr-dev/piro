"""Piro Modal inference job and HTTP endpoint."""

from __future__ import annotations

from typing import Any

import modal
from _common import R2_BUCKET, _r2_client, app, image, piro_secrets


@app.cls(
    image=image,
    secrets=[piro_secrets],
    timeout=120,
)
class Infer:
    @modal.enter()
    def setup(self):
        import io
        import json
        import os
        import re

        import psycopg2
        import torch

        self._io = io
        self._json = json
        self._os = os
        self._re = re
        self._psycopg2 = psycopg2
        self._torch = torch
        from architectures._common.encoding import memory_embedding, policy_embedding
        from architectures.ashfall.ctm import ContinuousThoughtModel, CTMConfig

        self._CTM = ContinuousThoughtModel
        self._CTMConfig = CTMConfig
        self._memory_embedding = memory_embedding
        self._policy_embedding = policy_embedding

        # model_id → (model, cfg_dict) — persists across warm calls
        self._cache: dict = {}

        print("[piro-infer] container ready")

    def _load(self, model_id: str):
        """Load model from R2 weights and cache it."""
        if model_id in self._cache:
            return self._cache[model_id]

        # Fetch R2 key prefix + configJson from DB
        conn = self._psycopg2.connect(self._os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute(
            """
            SELECT m."weightsR2Key", tr."configJson"
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

        if not row or not row[0]:
            raise ValueError(f"No weights stored for model {model_id!r} — retrain to populate")
        if not row[1]:
            raise ValueError(f"No configJson for model {model_id!r} — retrain to populate")

        r2_prefix, config_json_str = row
        cfg = self._json.loads(config_json_str)
        template = cfg.get("template")
        torch = self._torch

        if template in {"ctm", "ctm-10x"}:
            model_cfg = self._CTMConfig(
                n_neurons=cfg["n_neurons"],
                embed_dim=cfg["embed_dim"],
                query_dim=cfg["query_dim"],
                value_dim=cfg["value_dim"],
                hidden_dim=cfg["hidden_dim"],
                n_classes=cfg["n_classes"],
            )
            model = self._CTM(model_cfg)
        else:
            raise ValueError(f"Unknown template: {template!r}")

        # Download weights.pt from R2
        r2 = _r2_client(self._os)
        resp = r2.get_object(Bucket=R2_BUCKET, Key=f"{r2_prefix}/weights.pt")
        pt_bytes = resp["Body"].read()
        buf = self._io.BytesIO(pt_bytes)
        state = torch.load(buf, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        model.eval()

        self._cache[model_id] = (model, cfg)
        print(
            f"[piro-infer] loaded {model_id} ({template}, {sum(p.numel() for p in model.parameters())} params) from R2 {r2_prefix}/"
        )
        return self._cache[model_id]

    def _build_emb(self, seq: list[int], embed_dim: int) -> Any:
        """One-hot-ish embedding: position i gets a 1 at min(value, embed_dim-1)."""
        torch = self._torch
        emb = torch.zeros(len(seq), embed_dim)
        for i, val in enumerate(seq):
            emb[i, min(int(val), embed_dim - 1)] = 1.0
        return emb

    def _argmin_chunk(
        self, model, template: str, chunk: list[int], n_neurons: int, embed_dim: int
    ) -> int:
        """Run one model forward pass; return the value at the predicted argmin position."""
        torch = self._torch
        actual = len(chunk)
        # Pad with embed_dim-1 sentinel (largest encodable value) to fill n_neurons slots
        padded = chunk + [embed_dim - 1] * (n_neurons - actual)
        emb = self._build_emb(padded, embed_dim)
        with torch.no_grad():
            out = model(emb)
            logits = out.logits if hasattr(out, "logits") else out
        # Only consider logits for actual (non-padded) positions
        idx = int(logits[:actual].argmax().item())
        return chunk[idx]

    def _find_min(
        self, model, template: str, numbers: list[int], n_neurons: int, embed_dim: int
    ) -> int:
        """Recursively find the minimum using model as an argmin oracle."""
        if len(numbers) <= n_neurons:
            return self._argmin_chunk(model, template, numbers, n_neurons, embed_dim)
        # Divide into chunks, get min of each, then recurse
        candidates = [
            self._argmin_chunk(model, template, numbers[i : i + n_neurons], n_neurons, embed_dim)
            for i in range(0, len(numbers), n_neurons)
        ]
        return self._find_min(model, template, candidates, n_neurons, embed_dim)

    def _sort(
        self, model, template: str, numbers: list[int], n_neurons: int, embed_dim: int
    ) -> list[int]:
        """Selection sort using model as argmin oracle."""
        remaining = list(numbers)
        result = []
        while remaining:
            if len(remaining) == 1:
                result.append(remaining[0])
                break
            min_val = self._find_min(model, template, remaining, n_neurons, embed_dim)
            result.append(min_val)
            remaining.remove(min_val)
        return result

    def _json_state(self, value):
        """Convert a CTM snapshot into JSON-safe values for the next request."""
        if hasattr(value, "detach"):
            return value.detach().cpu().tolist()
        if isinstance(value, dict):
            return {key: self._json_state(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._json_state(item) for item in value]
        return value

    def _load_json_state(self, model, payload: dict):
        """Rebuild a JSON CTM snapshot with the model's device and dtypes."""
        torch = self._torch
        parameter = next(model.parameters())
        dtype = parameter.dtype
        device = parameter.device

        def tensor(value, *, tensor_dtype=dtype):
            return torch.tensor(value, dtype=tensor_dtype, device=device)

        state = {
            "previous_activations": (
                tensor(payload["previous_activations"])
                if payload.get("previous_activations") is not None
                else None
            ),
            "history_entries": [tensor(entry) for entry in payload.get("history_entries", [])],
        }
        if "plastic_weights" in payload:
            state["plastic_weights"] = tensor(payload["plastic_weights"])
            state["plastic_ticks"] = int(payload.get("plastic_ticks", 0))
        if "burst_counter" in payload:
            state["burst_counter"] = tensor(payload["burst_counter"], tensor_dtype=torch.long)
            state["refractory_counter"] = tensor(
                payload.get("refractory_counter", []), tensor_dtype=torch.long
            )
        if "phases" in payload:
            state["phases"] = tensor(payload["phases"])
        return state

    def _associative_step(
        self, model, cfg: dict, input_text: str, state: dict | None
    ) -> tuple[str, dict]:
        if cfg.get("template") not in {"ctm", "ctm-10x"}:
            raise ValueError("stateful dataset inference requires a CTM model")

        import torch

        if state is None:
            model.reset()
        else:
            model.load_state(self._load_json_state(model, state))

        parameter = next(model.parameters())
        policy_mode = cfg.get("dataSource") == "owner-policy-worlds"
        answer = "ACK"
        if policy_mode:
            is_query = "CHOICE|" not in input_text
            if is_query:
                encoded = self._policy_embedding(
                    input_text,
                    cfg["embed_dim"],
                    torch_module=torch,
                    dtype=parameter.dtype,
                    device=parameter.device,
                )
                output = model(encoded)
                logits = output.logits if hasattr(output, "logits") else output
                answer = str(int(logits.argmax().item()))
            else:
                for observation in input_text.splitlines():
                    observation = observation.strip()
                    if not observation:
                        continue
                    model(
                        self._policy_embedding(
                            observation,
                            cfg["embed_dim"],
                            torch_module=torch,
                            dtype=parameter.dtype,
                            device=parameter.device,
                        )
                    )
        else:
            for observation in input_text.splitlines():
                observation = observation.strip()
                if not observation:
                    continue
                is_query = "=" not in observation and not observation.startswith("token_")
                encoded = self._memory_embedding(
                    f"QUERY:{observation}" if is_query else observation,
                    cfg["embed_dim"],
                    torch_module=torch,
                    dtype=parameter.dtype,
                    device=parameter.device,
                )
                output = model(encoded)
                if is_query:
                    logits = output.logits if hasattr(output, "logits") else output
                    answer = f"value_{int(logits.argmax().item()):03d}"

        return answer, self._json_state(model.snapshot_state())

    @modal.method()
    def generate(
        self,
        model_id: str,
        prompt: str = "",
        input: str | None = None,
        state: dict | None = None,
    ) -> dict:
        """Run one sorting prompt or one stateful associative-recall invocation."""
        import time

        t0 = time.time()

        try:
            model, cfg = self._load(model_id)
            if input is not None:
                text, next_state = self._associative_step(model, cfg, input, state)
                return {
                    "text": text,
                    "state": next_state,
                    "durationMs": int((time.time() - t0) * 1000),
                }
        except Exception as exc:
            return {"text": "", "error": str(exc), "durationMs": 0}

        template = cfg["template"]
        chunk_size = cfg.get("n_neurons", 4)
        embed_dim = cfg["embed_dim"]
        match = self._re.search(r"\[([^\]]+)\]", prompt)
        if not match:
            return {"text": "", "durationMs": int((time.time() - t0) * 1000)}
        try:
            numbers = [int(x.strip()) for x in match.group(1).split(",")]
        except ValueError:
            return {"text": "", "durationMs": int((time.time() - t0) * 1000)}

        sorted_nums = self._sort(model, template, numbers, chunk_size, embed_dim)
        return {
            "text": " ".join(str(x) for x in sorted_nums),
            "durationMs": int((time.time() - t0) * 1000),
        }


@app.function(image=image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def infer(body: dict) -> dict:
    """
    Run inference on a trained Piro model.

    Body:
        {
            "model_id": str,
            "prompt":   str,                 # sorting inference
            "input":    str,                 # one Ashfall invocation
            "state":    dict | null,         # prior CTM snapshot for Ashfall
            "secret":   str,
        }

    Response:
        { "text": str, "state": dict, "durationMs": int }
    """
    import os

    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")

    model_id = body.get("model_id")
    prompt = body.get("prompt", "")
    input_text = body.get("input")
    state = body.get("state")
    if not model_id:
        raise HTTPException(status_code=400, detail="model_id required")
    if input_text is not None and (not isinstance(input_text, str) or not input_text.strip()):
        raise HTTPException(status_code=400, detail="input must be a non-empty string")
    if state is not None and not isinstance(state, dict):
        raise HTTPException(status_code=400, detail="state must be an object")
    if input_text is None and (not isinstance(prompt, str) or not prompt.strip()):
        raise HTTPException(status_code=400, detail="prompt required")

    inferrer = Infer()
    return inferrer.generate.remote(
        model_id=model_id,
        prompt=prompt,
        input=input_text,
        state=state,
    )
