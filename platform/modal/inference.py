"""Piro Modal inference job and HTTP endpoint."""

from __future__ import annotations

import re
import time
import traceback
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
        setup_started_at = time.perf_counter()
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
        self._container_setup_ms = round(
            (time.perf_counter() - setup_started_at) * 1000
        )

        print(
            f"[piro-infer] container ready containerSetupMs={self._container_setup_ms}"
        )

    def _load(self, model_id: str, architecture: str):
        """Load a model class through its canonical architecture entrypoint."""
        if not is_supported_architecture(architecture):
            raise ValueError(f"Unsupported architecture: {architecture!r}")

        cache_key = (model_id, architecture)
        if cache_key in self._cache:
            return self._cache[cache_key], True, 0

        load_started_at = time.perf_counter()
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
        model_load_ms = round((time.perf_counter() - load_started_at) * 1000)
        print(
            f"[piro-infer] loaded {model_id} ({architecture}, "
            f"{model.parameter_count()} params) from R2 {r2_prefix}/ "
            f"modelLoadMs={model_load_ms}"
        )
        return self._cache[cache_key], False, model_load_ms

    @modal.method()
    def generate(
        self,
        model_id: str,
        architecture: str,
        input_packet: dict[str, Any],
        state: dict[str, Any] | None = None,
        request_id: str | None = None,
    ) -> dict:
        """Dispatch one structured PiroInput packet to the architecture model."""
        worker_started_at = time.perf_counter()
        try:
            (model, _cfg), cache_hit, model_load_ms = self._load(
                model_id, architecture
            )
            invoke_started_at = time.perf_counter()
            result = model.invoke(input_packet, state)
            model_invoke_ms = round((time.perf_counter() - invoke_started_at) * 1000)
            if not isinstance(result, dict):
                raise ValueError("Architecture invocation must return an object")
            duration_ms = round((time.perf_counter() - worker_started_at) * 1000)
            timings = {
                "requestId": request_id,
                "workerMs": duration_ms,
                "modelLoadMs": model_load_ms,
                "modelInvokeMs": model_invoke_ms,
                "containerSetupMs": self._container_setup_ms,
                "cacheHit": cache_hit,
            }
            print(
                f"[piro-infer] requestTiming requestId={request_id or 'none'} "
                f"modelId={model_id} architecture={architecture} "
                f"workerMs={duration_ms} modelLoadMs={model_load_ms} "
                f"modelInvokeMs={model_invoke_ms} cacheHit={cache_hit}"
            )
            return {
                **result,
                "durationMs": duration_ms,
                "timings": timings,
            }
        except Exception as exc:
            duration_ms = round((time.perf_counter() - worker_started_at) * 1000)
            traceback_text = "".join(traceback.format_exception(exc))[-4000:]
            print(
                f"[piro-infer] inferenceError requestId={request_id or 'none'} "
                f"modelId={model_id} architecture={architecture} "
                f"workerMs={duration_ms} error={str(exc)[-1000:]}\n"
                f"[piro-infer] inferenceTraceback requestId={request_id or 'none'}\n"
                f"{traceback_text}"
            )
            return {
                "text": "",
                "error": str(exc),
                "durationMs": 0,
                "timings": {
                    "requestId": request_id,
                    "workerMs": duration_ms,
                    "containerSetupMs": self._container_setup_ms,
                },
            }


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
    request_id = body.get("request_id")
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

    endpoint_started_at = time.perf_counter()
    inferrer = Infer()
    result = inferrer.generate.remote(
        model_id=model_id,
        architecture=architecture,
        input_packet={"parts": parts},
        state=state,
        request_id=request_id if isinstance(request_id, str) else None,
    )
    modal_endpoint_ms = round((time.perf_counter() - endpoint_started_at) * 1000)
    timings = result.get("timings") if isinstance(result, dict) else None
    if not isinstance(timings, dict):
        timings = {}
    worker_ms = timings.get("workerMs")
    queue_ms = (
        max(0, modal_endpoint_ms - worker_ms)
        if isinstance(worker_ms, int | float)
        else None
    )
    result["timings"] = {
        **timings,
        "modalEndpointMs": modal_endpoint_ms,
        **({"modalQueueMs": queue_ms} if queue_ms is not None else {}),
    }
    return result
