"""OpenAI-compatible GLM 5.3 Flash serving on Modal through vLLM.

Mirrors the Gemma app (platform/modal/gemma.py): the pinned HF revision is
mirrored to R2 with a sha256 manifest (via the seed function), hydrated into
a Modal volume with integrity checks, and served through a supervised vLLM
subprocess behind a proxy that retains redacted failure diagnostics.

vLLM 0.30.0 is the first stable line carrying Glm5NextForConditionalGeneration
support (merged 2026-09-03, vllm#53906).
"""

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

from _common import R2_BUCKET, _r2_client, _r2_put_object, piro_secrets, trigger_image
from gemma_proxy import VllmSupervisor, create_proxy_server

APP_NAME = "piro-glm-vllm"
MODEL_NAME = "zai-org/GLM-5.3-Flash"
MODEL_REVISION = "eb9eb208eb0d988989d07a6a12d0fdeb5f52574a"
MODEL_PREFIX = f"models/{MODEL_NAME.replace('/', '--')}/{MODEL_REVISION}"
MODEL_DIR = Path("/root/.cache/huggingface/piro-models") / (
    f"{MODEL_NAME.replace('/', '--')}-{MODEL_REVISION}"
)
VLLM_PORT = 8000
VLLM_UPSTREAM_PORT = 8001
VLLM_VERSION = "0.30.0"
TENSOR_PARALLEL_SIZE = 4
MAX_MODEL_LEN = 32768
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

hf_cache = modal.Volume.from_name("piro-glm-huggingface-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("piro-glm-vllm-cache", create_if_missing=True)
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
        raise RuntimeError("Bucket manifest does not match the pinned GLM model revision")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise RuntimeError("Bucket manifest has no model files")
    return files


@app.function(
    image=vllm_image,
    secrets=[piro_secrets],
    timeout=4 * 60 * 60,
    cpu=8,
    volumes={"/root/.cache/huggingface": hf_cache},
)
def seed() -> dict:
    """Mirror the pinned GLM revision from HuggingFace into R2.

    Runs once: if the manifest already exists in the bucket, this is a no-op.
    Large shards upload through S3 multipart (boto3's upload_file) because
    single-part puts cap at 5 GB. The local volume cache is populated too, so
    the first Server boot can skip re-downloading ~300 GB from R2.
    """
    import hashlib
    import os
    import time

    from boto3.s3.transfer import TransferConfig
    from huggingface_hub import snapshot_download

    r2 = _r2_client(os)
    manifest_key = f"{MODEL_PREFIX}/manifest.json"
    try:
        r2.head_object(Bucket=R2_BUCKET, Key=manifest_key)
        print(f"[piro-glm] manifest already present at {manifest_key}; skipping seed")
        return {"status": "already-seeded"}
    except Exception:
        pass

    print(f"[piro-glm] downloading {MODEL_NAME}@{MODEL_REVISION} from HuggingFace")
    local_dir = snapshot_download(
        repo_id=MODEL_NAME,
        revision=MODEL_REVISION,
        local_dir=MODEL_DIR,
        max_workers=8,
    )

    files: list[dict] = []
    upload_config = TransferConfig(
        multipart_threshold=100 * 1024 * 1024,
        multipart_chunksize=64 * 1024 * 1024,
        max_concurrency=4,
        use_threads=True,
    )
    for path in sorted(Path(local_dir).rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        name = path.relative_to(local_dir).as_posix()
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(DOWNLOAD_CHUNK_BYTES):
                digest.update(chunk)
        key = _model_object_key(name)
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                r2.upload_file(str(path), R2_BUCKET, key, Config=upload_config)
                last_error = None
                break
            except Exception as error:
                last_error = error
                time.sleep(attempt * 5)
        if last_error is not None:
            raise RuntimeError(f"R2 upload failed for {key}: {last_error}")
        files.append(
            {
                "name": name,
                "key": key,
                "bytes": path.stat().st_size,
                "sha256": digest.hexdigest(),
            }
        )
        print(f"[piro-glm] mirrored {name} ({path.stat().st_size} bytes)", flush=True)

    manifest = {"model": MODEL_NAME, "revision": MODEL_REVISION, "files": files}
    _r2_put_object(
        os,
        key=manifest_key,
        body=json.dumps(manifest, indent=2).encode("utf-8"),
        content_type="application/json",
    )
    (MODEL_DIR / ".piro-manifest.json").write_text(
        json.dumps({"model": MODEL_NAME, "revision": MODEL_REVISION}, indent=2)
    )
    hf_cache.commit()
    print(f"[piro-glm] seeded {len(files)} files to {R2_BUCKET}/{MODEL_PREFIX}")
    return {"status": "seeded", "files": len(files)}


@app.server(
    image=vllm_image,
    gpu="H100:4",
    scaledown_window=15 * 60,
    startup_timeout=60 * 60,
    volumes={
        "/root/.cache/huggingface": hf_cache,
        "/root/.cache/vllm": vllm_cache,
    },
    secrets=[piro_secrets],
    port=VLLM_PORT,
    routing_region="us-east",
    target_concurrency=8,
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
            print(f"[piro-glm] using verified local model cache {MODEL_DIR}")
            return MODEL_DIR

        base_dir = MODEL_DIR.parent
        base_dir.mkdir(parents=True, exist_ok=True)
        temp_dir = Path(tempfile.mkdtemp(prefix=".glm-model-", dir=base_dir))
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
            print(f"[piro-glm] hydrated {MODEL_DIR} from {R2_BUCKET}/{MODEL_PREFIX}")
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
            str(TENSOR_PARALLEL_SIZE),
            "--max-model-len",
            str(MAX_MODEL_LEN),
            # Eager mode trades throughput for launch reliability and leaves
            # headroom for KV cache on a weights-heavy MoE.
            "--enforce-eager",
            "--limit-mm-per-prompt",
            json.dumps({"image": 0, "video": 0, "audio": 0}),
        ]
        print("[piro-glm] launching supervised vLLM", *command, flush=True)
        self.supervisor = VllmSupervisor(
            command,
            Path("/tmp/piro-glm/vllm.log"),
            MODEL_NAME,
            MODEL_REVISION,
            log_tag="piro-glm",
        )
        self.proxy, self.proxy_thread = create_proxy_server(
            self.supervisor,
            VLLM_UPSTREAM_PORT,
            VLLM_PORT,
            log_tag="piro-glm-proxy",
        )

    @modal.exit()
    def stop(self):
        self.proxy.shutdown()
        self.proxy.server_close()
        self.supervisor.stop()


@app.function(image=trigger_image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def control(body: dict) -> dict:
    """Report GLM lifecycle state and trigger a cold-start probe."""
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
