"""Shared configuration for Piro's Modal job entrypoints."""

from __future__ import annotations

import sys
from pathlib import Path

import modal

PLATFORM_DIR = Path(__file__).resolve().parents[1]
if str(PLATFORM_DIR) not in sys.path:
    sys.path.insert(0, str(PLATFORM_DIR))

R2_BUCKET = "piro-kb"
TRAINING_GPU = "T4"
TRAINING_CPU = 1.0
TRAINING_MEMORY_MB = 4096
TRAINING_TIMEOUT_SECONDS = 3300
TRAINING_DEADLINE_SECONDS = 3000
CHECKPOINT_INTERVAL_STEPS = 1
EVAL_INTERVAL_STEPS = 250
CHECKPOINT_SAFETY_SECONDS = 120
HEARTBEAT_INTERVAL_SECONDS = 30
GPU_RATE_USD_PER_SECOND = 0.000164
CPU_RATE_USD_PER_CORE_SECOND = 0.0000131
MEMORY_RATE_USD_PER_GIB_SECOND = 0.00000222
# Each entrypoint is deployed as its own Modal App so its lifecycle and hardware
# profile can evolve independently.
TRAINING_APP = "piro-training"
INFERENCE_APP = "piro-inference"
SOURCE_APP = "piro-source"


def _r2_client(os_module):
    import boto3

    endpoint = os_module.environ["BUCKET_ENDPOINT_URL"]
    if not endpoint.startswith("http"):
        endpoint = f"https://{endpoint}"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os_module.environ["BUCKET_KEY_ID"],
        aws_secret_access_key=os_module.environ["BUCKET_APPLICATION_SECRET"],
        region_name="auto",
    )


image = (
    modal.Image.debian_slim(python_version="3.11")
    .env({"PYTHONPATH": "/root/platform/modal"})
    .pip_install(
        "torch>=2.3.0",
        "numpy>=1.26.0",
        "psycopg2-binary>=2.9",
        "fastapi[standard]>=0.110.0",
        "boto3>=1.34.0",
        "pydantic>=2.0",
    )
    .add_local_python_source("architectures")
    .add_local_python_source("sources")
    .add_local_dir("platform", remote_path="/root/platform")
)

# Web triggers only validate input and spawn a worker. Keep them separate from
# the heavy model images so Modal can acknowledge requests during cold starts.
trigger_image = (
    modal.Image.debian_slim(python_version="3.11")
    .env({"PYTHONPATH": "/root/platform/modal"})
    .pip_install("fastapi[standard]>=0.110.0")
    .add_local_dir("platform/modal", remote_path="/root/platform/modal")
)

piro_secrets = modal.Secret.from_name("piro-secrets")
