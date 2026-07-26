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
    }
    for filename, (app_name, function_name) in expected.items():
        source = (MODAL_DIR / filename).read_text()
        assert f"modal.App({app_name})" in source
        assert function_name in source
        assert 'modal.App("piro")' not in source


def test_training_persists_the_dedicated_inference_endpoint():
    source = (MODAL_DIR / "_common.py").read_text()
    assert "https://dvargasfuertes--piro-inference-infer.modal.run" in source


def test_training_and_source_triggers_use_the_lightweight_image():
    common = (MODAL_DIR / "_common.py").read_text()
    training = (MODAL_DIR / "training.py").read_text()
    source = (MODAL_DIR / "source.py").read_text()

    assert "trigger_image = modal.Image.debian_slim" in common
    assert "@app.function(image=trigger_image, secrets=[piro_secrets])\n@modal.fastapi_endpoint" in training
    assert "@app.function(image=trigger_image, secrets=[piro_secrets])\n@modal.fastapi_endpoint" in source
    assert "@app.cls(\n    image=image," in training


def test_training_dispatch_has_a_bounded_timeout():
    source = (Path(__file__).parents[1] / "src" / "app" / "api" / "training-runs" / "route.ts").read_text()
    assert "signal: AbortSignal.timeout(30_000)" in source
    assert 'Modal trigger timed out after 30 seconds.' in source
