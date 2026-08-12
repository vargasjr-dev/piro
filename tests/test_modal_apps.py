import re
from pathlib import Path

MODAL_DIR = Path(__file__).parents[1] / "platform" / "modal"


def test_modal_entrypoints_have_distinct_apps_and_expected_web_functions():
    common = (MODAL_DIR / "_common.py").read_text()
    assert 'TRAINING_APP = "piro-training"' in common
    assert 'INFERENCE_APP = "piro-inference"' in common
    assert 'SOURCE_APP = "piro-source"' in common

    expected = {
        "training.py": ("TRAINING_APP", "def trigger"),
        "inference.py": ("INFERENCE_APP", "def infer"),
        "source.py": ("SOURCE_APP", "def source"),
        "gemma.py": ("APP_NAME", "class Server"),
    }
    for filename, (app_name, function_name) in expected.items():
        source = (MODAL_DIR / filename).read_text()
        assert f"modal.App({app_name})" in source
        assert function_name in source
        assert 'modal.App("piro")' not in source


def test_training_does_not_persist_infrastructure_endpoint():
    source = (MODAL_DIR / "training.py").read_text()
    assert "inferenceEndpoint" not in source
    assert "INFER_ENDPOINT" not in source


def test_gemma_server_pins_weights_and_uses_openai_compatible_vllm():
    source = (MODAL_DIR / "gemma.py").read_text()
    assert 'APP_NAME = "piro-gemma-vllm"' in source
    assert 'MODEL_NAME = "google/gemma-3-270m"' in source
    assert 'MODEL_REVISION = "9b0cfec892e2bc2afd938c98eabe4e4a7b1e0ca1"' in source
    assert 'VLLM_VERSION = "0.21.0"' in source
    assert '"/v1/chat/completions"' not in source
    assert 'routing_region="us-east"' in source
    assert '"--served-model-name"' in source
    assert 'modal.Volume.from_name("piro-gemma-huggingface-cache"' in source
    assert 'modal.Volume.from_name("piro-gemma-vllm-cache"' in source
    assert 'secrets=[piro_secrets]' in source
    assert 'HF_HUB_OFFLINE": "1"' in source
    assert 'TRANSFORMERS_OFFLINE": "1"' in source
    assert 'MODEL_PREFIX = f"models/{MODEL_NAME.replace('/', '--')}/{MODEL_REVISION}"' in source
    assert '"--revision"' not in source
    assert 'r2.get_object(Bucket=R2_BUCKET, Key=manifest_key)' in source
    assert 'Integrity check failed' in source
    assert 'shutil.rmtree(temp_dir, ignore_errors=True)' in source


def test_gemma_workflow_collects_diagnostics_after_readiness_failure():
    workflow = (Path(__file__).parents[1] / ".github" / "workflows" / "modal-deploy.yml").read_text()
    assert "modal deploy platform/modal/gemma.py --timestamps" in workflow
    assert "id: deploy" in workflow
    assert "if: steps.deploy.outcome == 'success'" in workflow
    assert "GEMMA_ENDPOINT: https://dvargasfuertes--piro-gemma-vllm-server.us-east.modal.direct/v1/models" in workflow
    assert "modal app logs piro-gemma-vllm" in workflow
    assert "modal app history piro-gemma-vllm --json" in workflow
    assert workflow.count("MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}") >= 5
    assert workflow.count("MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}") >= 5
    assert "gemma-deployment-diagnostics-${{ github.sha }}" in workflow
    assert "gemma-readiness.log" in workflow
    assert workflow.count("if: always()") >= 2


def test_training_image_installs_architecture_runtime_dependencies():
    common = (MODAL_DIR / "_common.py").read_text()

    assert '"tiktoken>=0.13.0"' in common


def test_modal_images_only_package_existing_local_python_sources():
    common = (MODAL_DIR / "_common.py").read_text()
    package_root = MODAL_DIR.parents[1]
    sources = re.findall(r'\.add_local_python_source\("([^"]+)"\)', common)

    assert sources
    assert all((package_root / source).is_dir() for source in sources), sources
    assert "benchmarks" not in sources


def test_modal_images_own_the_shared_module_import_path():
    common = (MODAL_DIR / "_common.py").read_text()
    training = (MODAL_DIR / "training.py").read_text()
    source = (MODAL_DIR / "source.py").read_text()
    inference = (MODAL_DIR / "inference.py").read_text()

    assert common.count('.env({"PYTHONPATH": "/root/platform/modal"})') == 2
    assert '.add_local_dir("platform/modal", remote_path="/root/platform/modal")' in common
    assert "sys.path.insert" not in training
    assert "sys.path.insert" not in inference
    assert "sys.path.insert" not in source
    assert "@app.function(image=trigger_image, secrets=[piro_secrets])\n@modal.fastapi_endpoint" in training
    assert "@app.function(image=trigger_image, secrets=[piro_secrets])\n@modal.fastapi_endpoint" in source
    assert "@app.cls(\n    image=image," in training


def test_training_checkpoints_after_every_optimizer_step():
    source = (MODAL_DIR / "_common.py").read_text()

    assert "CHECKPOINT_INTERVAL_STEPS = 1" in source


def test_training_dispatch_has_a_bounded_timeout():
    source = (Path(__file__).parents[1] / "src" / "app" / "api" / "training-runs" / "route.ts").read_text()
    assert "signal: AbortSignal.timeout(30_000)" in source
    assert 'Modal trigger timed out after 30 seconds.' in source
