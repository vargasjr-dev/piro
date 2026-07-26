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
