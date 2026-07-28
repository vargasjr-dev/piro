"""Piro Modal inference job and HTTP endpoint."""

from __future__ import annotations

from pathlib import Path
import sys
from typing import Any

# Modal runs this entrypoint as /root/inference.py while shared modules live in
# /root/platform/modal. Resolve both the local source and deployed layouts.
_ENTRYPOINT_DIR = Path(__file__).resolve().parent
for _candidate in (_ENTRYPOINT_DIR, _ENTRYPOINT_DIR / "platform" / "modal"):
    if (_candidate / "_common.py").exists():
        sys.path.insert(0, str(_candidate))
        break

import modal
from _common import INFERENCE_APP, R2_BUCKET, _r2_client, image, piro_secrets

app = modal.App(INFERENCE_APP)

SUPPORTED_ARCHITECTURES = frozenset({"ashfall", "borealis"})


@app.cls(
    image=image,
    secrets=[piro_secrets],
    timeout=120,
)
class Infer:
    @modal.enter()
    def setup(self):
        import importlib
        import io
        import json
        import os

        import psycopg2
        import torch

        self._import_module = importlib.import_module
        self._io = io
        self._json = json
        self._os = os
        self._psycopg2 = psycopg2
        self._torch = torch
        self._cache: dict[tuple[str, str], tuple[Any, dict[str, Any], Any]] = {}

        print("[piro-infer] container ready")

    def _load(self, model_id: str, architecture: str):
        """Load a model through its architecture-owned main.py entrypoint."""
        if architecture not in SUPPORTED_ARCHITECTURES:
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
        pt_bytes = resp["Body"].read()
        state = self._torch.load(
            self._io.BytesIO(pt_bytes),
            map_location="cpu",
            weights_only=True,
        )

        entrypoint = self._import_module(f"architectures.{architecture}.main")
        load_model = getattr(entrypoint, "load_model", None)
        invoke = getattr(entrypoint, "invoke", None)
        if not callable(load_model) or not callable(invoke):
            raise ValueError(f"Architecture {architecture!r} has no usable main.py entrypoint")

        model = load_model(cfg, state)
        self._cache[cache_key] = (model, cfg, entrypoint)
        print(
            f"[piro-infer] loaded {model_id} ({architecture}, "
            f"{sum(p.numel() for p in model.parameters())} params) from R2 {r2_prefix}/"
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
        """Dispatch one structured PiroInput packet to an architecture entrypoint."""
        import time

        t0 = time.time()
        try:
            model, _cfg, entrypoint = self._load(model_id, architecture)
            result = entrypoint.invoke(model, input_packet, state, _cfg)
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
    """
    Run inference on a trained Piro model.

    The request extends the public PiroInput packet with platform metadata::

        {
            "parts": [{"type": "text", "text": "..."}],
            "model_id": str,
            "architecture": "ashfall" | "borealis",
            "state": dict | null,
            "secret": str,
        }

    Response::

        { "text": str, "state": dict | null, "durationMs": int }
    """
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
    if not isinstance(architecture, str) or architecture not in SUPPORTED_ARCHITECTURES:
        raise HTTPException(status_code=400, detail="architecture must be ashfall or borealis")
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
