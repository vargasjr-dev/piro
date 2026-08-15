"""OpenAI-compatible Gemma serving on Modal through vLLM."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import modal

# Modal hydrates server modules before applying the image environment. Make the
# shared sibling module importable during that early hydration phase as well.
_REMOTE_MODAL_DIR = "/root/platform/modal"
if _REMOTE_MODAL_DIR not in sys.path:
    sys.path.insert(0, _REMOTE_MODAL_DIR)

from _common import R2_BUCKET, _r2_client, piro_secrets, trigger_image
from gemma_proxy import VllmSupervisor, create_proxy_server

APP_NAME = "piro-gemma-vllm"
MODEL_NAME = "google/gemma-3-270m-it"
MODEL_REVISION = "ac82b4e820549b854eebf28ce6dedaf9fdfa17b3"
MODEL_PREFIX = f"models/{MODEL_NAME.replace('/', '--')}/{MODEL_REVISION}"
MODEL_DIR = Path("/root/.cache/huggingface/piro-models") / (
    f"{MODEL_NAME.replace('/', '--')}-{MODEL_REVISION}"
)
VLLM_PORT = 8000
VLLM_UPSTREAM_PORT = 8001
VLLM_VERSION = "0.21.0"
DOWNLOAD_CHUNK_BYTES = 8 * 1024 * 1024

vllm_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .pip_install(f"vllm=={VLLM_VERSION}", "boto3>=1.34.0")
    .env(
        {
            "HF_XET_HIGH_PERFORMANCE": "1",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            # FlashInfer's sampler is unreliable on older GPU compute capabilities;
            # use vLLM's native sampler for stable generation.
            "VLLM_USE_FLASHINFER_SAMPLER": "0",
            "VLLM_LOG_STATS_INTERVAL": "1",
            "PYTHONPATH": "/root/platform/modal",
        }
    )
    .add_local_dir("platform/modal", remote_path="/root/platform/modal")
)

hf_cache = modal.Volume.from_name("piro-gemma-huggingface-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("piro-gemma-vllm-cache", create_if_missing=True)
app = modal.App(APP_NAME)


def _model_object_key(name: str) -> str:
    from urllib.parse import quote

    return f"{MODEL_PREFIX}/{'/'.join(quote(part, safe="") for part in name.split("/"))}"


def _relative_model_path(name: str) -> Path:
    """Convert a manifest filename into a safe path beneath the model directory."""
    from pathlib import PurePosixPath

    path = PurePosixPath(name)
    if not name or path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"Invalid model filename in manifest: {name!r}")
    return Path(*path.parts)


def _manifest_files(manifest: dict) -> list[dict]:
    if manifest.get("model") != MODEL_NAME or manifest.get("revision") != MODEL_REVISION:
        raise RuntimeError("Bucket manifest does not match the pinned Gemma model revision")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise RuntimeError("Bucket manifest has no model files")
    return files


@app.server(
    image=vllm_image,
    gpu="A10",
    scaledown_window=5 * 60,
    startup_timeout=10 * 60,
    volumes={
        "/root/.cache/huggingface": hf_cache,
        "/root/.cache/vllm": vllm_cache,
    },
    secrets=[piro_secrets],
    port=VLLM_PORT,
    routing_region="us-east",
    target_concurrency=32,
    unauthenticated=True,
)
class Server:
    def _local_cache_matches(self, files: list[dict]) -> bool:
        import hashlib

        marker_path = MODEL_DIR / ".piro-manifest.json"
        if not marker_path.is_file():
            return False
        try:
            marker = json.loads(marker_path.read_text())
        except (OSError, ValueError):
            return False
        if marker.get("model") != MODEL_NAME or marker.get("revision") != MODEL_REVISION:
            return False

        for entry in files:
            name = entry.get("name")
            expected_bytes = entry.get("bytes")
            expected_sha256 = entry.get("sha256")
            if not isinstance(name, str) or not isinstance(expected_bytes, int) or not isinstance(
                expected_sha256, str
            ):
                return False
            path = MODEL_DIR / _relative_model_path(name)
            if not path.is_file() or path.stat().st_size != expected_bytes:
                return False
            digest = hashlib.sha256()
            with path.open("rb") as source:
                while chunk := source.read(DOWNLOAD_CHUNK_BYTES):
                    digest.update(chunk)
            if digest.hexdigest() != expected_sha256:
                return False
        return True

    def _hydrate_model(self) -> Path:
        import hashlib
        import os
        import shutil
        import tempfile

        r2 = _r2_client(os)
        manifest_key = f"{MODEL_PREFIX}/manifest.json"
        manifest_response = r2.get_object(Bucket=R2_BUCKET, Key=manifest_key)
        try:
            manifest = json.loads(manifest_response["Body"].read().decode("utf-8"))
        finally:
            manifest_response["Body"].close()
        files = _manifest_files(manifest)

        if self._local_cache_matches(files):
            print(f"[piro-gemma] using verified local model cache {MODEL_DIR}")
            return MODEL_DIR

        base_dir = MODEL_DIR.parent
        base_dir.mkdir(parents=True, exist_ok=True)
        temp_dir = Path(tempfile.mkdtemp(prefix=".gemma-model-", dir=base_dir))
        try:
            for entry in files:
                name = entry.get("name")
                key = entry.get("key")
                expected_bytes = entry.get("bytes")
                expected_sha256 = entry.get("sha256")
                if (
                    not isinstance(name, str)
                    or key != _model_object_key(name)
                    or not isinstance(expected_bytes, int)
                    or not isinstance(expected_sha256, str)
                ):
                    raise RuntimeError(f"Invalid bucket manifest entry for {name!r}")

                target = temp_dir / _relative_model_path(name)
                target.parent.mkdir(parents=True, exist_ok=True)
                response = r2.get_object(Bucket=R2_BUCKET, Key=key)
                digest = hashlib.sha256()
                byte_count = 0
                try:
                    with target.open("wb") as output:
                        while chunk := response["Body"].read(DOWNLOAD_CHUNK_BYTES):
                            output.write(chunk)
                            digest.update(chunk)
                            byte_count += len(chunk)
                finally:
                    response["Body"].close()

                if byte_count != expected_bytes or digest.hexdigest() != expected_sha256:
                    raise RuntimeError(f"Integrity check failed for bucket object {key}")

            (temp_dir / ".piro-manifest.json").write_text(
                json.dumps({"model": MODEL_NAME, "revision": MODEL_REVISION}, indent=2)
            )
            if MODEL_DIR.exists():
                shutil.rmtree(MODEL_DIR)
            os.replace(temp_dir, MODEL_DIR)
            hf_cache.commit()
            print(f"[piro-gemma] hydrated {MODEL_DIR} from {R2_BUCKET}/{MODEL_PREFIX}")
            return MODEL_DIR
        except Exception:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise

    @modal.enter()
    def start(self):
        model_dir = self._hydrate_model()
        command = [
            "vllm",
            "serve",
            str(model_dir),
            "--served-model-name",
            MODEL_NAME,
            "--host",
            "127.0.0.1",
            "--port",
            str(VLLM_UPSTREAM_PORT),
            "--tensor-parallel-size",
            "1",
            "--max-model-len",
            "2048",
            "--enforce-eager",
            "--limit-mm-per-prompt",
            json.dumps({"image": 0, "video": 0, "audio": 0}),
        ]
        print("[piro-gemma] launching supervised vLLM", *command, flush=True)
        self.supervisor = VllmSupervisor(
            command,
            Path("/tmp/piro-gemma/vllm.log"),
            MODEL_NAME,
            MODEL_REVISION,
        )
        self.proxy, self.proxy_thread = create_proxy_server(
            self.supervisor,
            VLLM_UPSTREAM_PORT,
            VLLM_PORT,
        )

    @modal.exit()
    def stop(self):
        self.proxy.shutdown()
        self.proxy.server_close()
        self.supervisor.stop()

@app.function(image=trigger_image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def control(body: dict) -> dict:
    """Report Gemma lifecycle state and trigger a cold-start probe."""
    import os
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")

    action = body.get("action", "status")
    if action not in {"status", "wake"}:
        raise HTTPException(status_code=400, detail="action must be status or wake")

    server = modal.Server.from_name(APP_NAME, "Server")
    try:
        stats = modal.Function.from_name(APP_NAME, "Server").get_current_stats()
        endpoint = server.get_url()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Modal lifecycle status unavailable") from exc

    runner_count = stats.num_total_runners
    if not endpoint:
        return {"status": "unavailable", "runnerCount": runner_count}

    if runner_count == 0 and action == "status":
        return {"status": "sleeping", "runnerCount": runner_count}

    try:
        request = Request(f"{endpoint.rstrip('/')}/v1/models", method="GET")
        with urlopen(request, timeout=8) as response:
            if 200 <= response.status < 300:
                return {"status": "ready", "runnerCount": runner_count}
            if response.status == 503:
                return {
                    "status": "starting",
                    "runnerCount": runner_count,
                    "retryAfterMs": 5_000,
                }
            return {"status": "unavailable", "runnerCount": runner_count}
    except HTTPError as exc:
        if exc.code == 503:
            return {
                "status": "starting",
                "runnerCount": runner_count,
                "retryAfterMs": 5_000,
            }
        return {"status": "unavailable", "runnerCount": runner_count}
    except (TimeoutError, URLError, OSError):
        return {
            "status": "starting" if action == "wake" or runner_count > 0 else "unavailable",
            "runnerCount": runner_count,
            "retryAfterMs": 5_000 if action == "wake" or runner_count > 0 else None,
        }
