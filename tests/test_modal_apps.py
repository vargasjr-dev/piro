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


def test_training_persists_the_dedicated_inference_endpoint():
    source = (MODAL_DIR / "_common.py").read_text()
    assert "https://dvargasfuertes--piro-inference-infer.modal.run" in source


def test_gemma_server_pins_weights_and_uses_openai_compatible_vllm():
    source = (MODAL_DIR / "gemma.py").read_text()
    assert 'APP_NAME = "piro-gemma-vllm"' in source
    assert 'MODEL_NAME = "google/gemma-3-270m"' in source
    assert 'MODEL_REVISION = "9b0cfec892e2bc2afd938c98eabe4e4a7b1e0ca1"' in source
    assert 'VLLM_VERSION = "0.21.0"' in source
    assert '"/v1/chat/completions"' not in source
    assert '"--served-model-name"' in source
    assert 'modal.Volume.from_name("piro-gemma-huggingface-cache"' in source
    assert 'modal.Volume.from_name("piro-gemma-vllm-cache"' in source


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


def test_training_dispatch_has_a_bounded_timeout():
    source = (Path(__file__).parents[1] / "src" / "app" / "api" / "training-runs" / "route.ts").read_text()
    assert "signal: AbortSignal.timeout(30_000)" in source
    assert 'Modal trigger timed out after 30 seconds.' in source
