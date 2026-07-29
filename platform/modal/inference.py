"""Piro Modal inference job and HTTP endpoint."""

from __future__ import annotations

import re
from typing import Any

import modal
from _common import INFERENCE_APP, R2_BUCKET, _r2_client, image, piro_secrets

app = modal.App(INFERENCE_APP)

ARCHITECTURE_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def is_supported_architecture(value: object) -> bool:
    return isinstance(value, str) and ARCHITECTURE_NAME.fullmatch(value) is not None


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

        import psycopg2
        import torch

        from architectures._common import load_architecture

        self._io = io
        self._json = json
        self._os = os
        self._psycopg2 = psycopg2
        self._torch = torch
        self._load_architecture = load_architecture
        self._cache: dict[tuple[str, str], tuple[Any, dict[str, Any]]] = {}

        print("[piro-infer] container ready")

    def _load(self, model_id: str, architecture: str):
        """Load a model class through its canonical architecture entrypoint."""
        if not is_supported_architecture(architecture):
            raise ValueError(f"Unsupported architecture: {architecture!r}")

        cache_key = (model_id, architecture)
        if cache_key in self._cache:
            return self._cache[cache_key]

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
        if not isinstance(cfg, dict):
            raise ValueError(f"Invalid configJson for model {model_id!r}")

        r2 = _r2_client(self._os)
        resp = r2.get_object(Bucket=R2_BUCKET, Key=f"{r2_prefix}/weights.pt")
        state = self._torch.load(
            self._io.BytesIO(resp["Body"].read()),
            map_location="cpu",
            weights_only=True,
        )

        architecture_class = self._load_architecture(f"architectures/{architecture}/main.py")
        model = architecture_class.from_config(cfg)
        model.load_model_state(state)
        model.eval()
        self._cache[cache_key] = (model, cfg)
        print(
            f"[piro-infer] loaded {model_id} ({architecture}, "
            f"{model.parameter_count()} params) from R2 {r2_prefix}/"
        )
        return self._cache[cache_key]

    @modal.method()
    def generate(
        self,
        model_id: str,
        architecture: str,
        input_packet: dict[str, Any],
        state: dict[str, Any] | None = None,
    ) -> dict:
        """Dispatch one structured PiroInput packet to the architecture model."""
        import time

        t0 = time.time()
        try:
            model, _cfg = self._load(model_id, architecture)
            result = model.invoke(input_packet, state)
            if not isinstance(result, dict):
                raise ValueError("Architecture invocation must return an object")
            return {
                **result,
                "durationMs": int((time.time() - t0) * 1000),
            }
        except Exception as exc:
            return {"text": "", "error": str(exc), "durationMs": 0}


@app.function(image=image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def infer(body: dict) -> dict:
    """Run inference on a trained Piro model."""
    import os

    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")

    model_id = body.get("model_id")
    architecture = body.get("architecture")
    parts = body.get("parts")
    state = body.get("state")
    if not isinstance(model_id, str) or not model_id:
        raise HTTPException(status_code=400, detail="model_id required")
    if not is_supported_architecture(architecture):
        raise HTTPException(status_code=400, detail="architecture must be a valid architecture name")
    if not isinstance(parts, list) or not parts:
        raise HTTPException(status_code=400, detail="parts must be a non-empty array")
    for part in parts:
        if (
            not isinstance(part, dict)
            or part.get("type") != "text"
            or not isinstance(part.get("text"), str)
            or not part["text"].strip()
        ):
            raise HTTPException(status_code=400, detail="parts must contain non-empty text parts")
    if state is not None and not isinstance(state, dict):
        raise HTTPException(status_code=400, detail="state must be an object")

    inferrer = Infer()
    return inferrer.generate.remote(
        model_id=model_id,
        architecture=architecture,
        input_packet={"parts": parts},
        state=state,
    )
