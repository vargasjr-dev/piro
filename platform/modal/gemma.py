"""OpenAI-compatible Gemma serving on Modal through vLLM."""

from __future__ import annotations

import json
from pathlib import Path

import modal
from _common import R2_BUCKET, _r2_client, piro_secrets

APP_NAME = "piro-gemma-vllm"
MODEL_NAME = "google/gemma-3-270m"
MODEL_REVISION = "9b0cfec892e2bc2afd938c98eabe4e4a7b1e0ca1"
MODEL_PREFIX = f"models/{MODEL_NAME.replace('/', '--')}/{MODEL_REVISION}"
MODEL_DIR = Path("/root/.cache/huggingface/piro-models") / (
    f"{MODEL_NAME.replace('/', '--')}-{MODEL_REVISION}"
)
VLLM_PORT = 8000
VLLM_VERSION = "0.21.0"
CHAT_TEMPLATE_PATH = "/root/platform/modal/gemma-chat-template.jinja"
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
    gpu="T4",
    scaledown_window=15 * 60,
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
        import subprocess

        model_dir = self._hydrate_model()
        command = [
            "vllm",
            "serve",
            str(model_dir),
            "--served-model-name",
            MODEL_NAME,
            "--host",
            "0.0.0.0",
            "--port",
            str(VLLM_PORT),
            "--tensor-parallel-size",
            "1",
            "--max-model-len",
            "2048",
            "--chat-template",
            CHAT_TEMPLATE_PATH,
            "--enforce-eager",
            "--limit-mm-per-prompt",
            json.dumps({"image": 0, "video": 0, "audio": 0}),
        ]
        print(*command)
        self.process = subprocess.Popen(command)

    @modal.exit()
    def stop(self):
        self.process.terminate()
