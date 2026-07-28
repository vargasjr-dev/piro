"""OpenAI-compatible Gemma serving on Modal through vLLM."""

from __future__ import annotations

import json

import modal

APP_NAME = "piro-gemma-vllm"
MODEL_NAME = "google/gemma-3-270m"
MODEL_REVISION = "9b0cfec892e2bc2afd938c98eabe4e4a7b1e0ca1"
VLLM_PORT = 8000
VLLM_VERSION = "0.21.0"

vllm_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .uv_pip_install(f"vllm=={VLLM_VERSION}")
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "VLLM_LOG_STATS_INTERVAL": "1"})
)

hf_cache = modal.Volume.from_name("piro-gemma-huggingface-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("piro-gemma-vllm-cache", create_if_missing=True)
app = modal.App(APP_NAME)


@app.server(
    image=vllm_image,
    gpu="T4",
    scaledown_window=15 * 60,
    startup_timeout=10 * 60,
    volumes={
        "/root/.cache/huggingface": hf_cache,
        "/root/.cache/vllm": vllm_cache,
    },
    port=VLLM_PORT,
    routing_region="us-east",
    target_concurrency=32,
    unauthenticated=True,
)
class Server:
    @modal.enter()
    def start(self):
        import subprocess

        command = [
            "vllm",
            "serve",
            MODEL_NAME,
            "--revision",
            MODEL_REVISION,
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
            "--enforce-eager",
            "--limit-mm-per-prompt",
            json.dumps({"image": 0, "video": 0, "audio": 0}),
        ]
        print(*command)
        self.process = subprocess.Popen(command)

    @modal.exit()
    def stop(self):
        self.process.terminate()
