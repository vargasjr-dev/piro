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
    assert 'MODEL_NAME = "google/gemma-3-270m-it"' in source
    assert 'MODEL_REVISION = "ac82b4e820549b854eebf28ce6dedaf9fdfa17b3"' in source
    assert 'VLLM_VERSION = "0.21.0"' in source
    assert '"--chat-template"' not in source
    assert '"/v1/chat/completions"' not in source
    assert 'routing_region="us-east"' in source
    assert 'gpu="A10"' in source
    assert '"--served-model-name"' in source
    assert 'modal.Volume.from_name("piro-gemma-huggingface-cache"' in source
    assert 'modal.Volume.from_name("piro-gemma-vllm-cache"' in source
    assert 'secrets=[piro_secrets]' in source
    assert 'sys.path.insert(0, _REMOTE_MODAL_DIR)' in source
    assert '_REMOTE_MODAL_DIR = "/root/platform/modal"' in source
    assert '.env({"PYTHONPATH": "/root/platform/modal"})' in source or '"PYTHONPATH": "/root/platform/modal"' in source
    assert '.add_local_dir("platform/modal", remote_path="/root/platform/modal")' in source
    assert source.index('.add_local_dir("platform/modal", remote_path="/root/platform/modal")') > source.index('.pip_install(f"vllm=={VLLM_VERSION}", "boto3>=1.34.0")')
    assert 'HF_HUB_OFFLINE": "1"' in source
    assert 'TRANSFORMERS_OFFLINE": "1"' in source
    assert '"VLLM_USE_FLASHINFER_SAMPLER": "0"' in source
    assert "from gemma_proxy import VllmSupervisor, create_proxy_server" in source
    assert "VLLM_UPSTREAM_PORT = 8001" in source
    assert '"--host",\n            "127.0.0.1"' in source
    assert '"/tmp/piro-gemma/vllm.log"' in source
    assert "MODEL_PREFIX = f\"models/{MODEL_NAME.replace('/', '--')}/{MODEL_REVISION}\"" in source
    assert '"--revision"' not in source
    assert 'r2.get_object(Bucket=R2_BUCKET, Key=manifest_key)' in source
    assert 'Integrity check failed' in source
    assert 'shutil.rmtree(temp_dir, ignore_errors=True)' in source


def test_training_workflow_collects_authenticated_diagnostics_after_deploy_failure():
    workflow = (Path(__file__).parents[1] / ".github" / "workflows" / "modal-deploy.yml").read_text()
    assert "modal deploy platform/modal/training.py --timestamps" in workflow
    assert "id: deploy" in workflow
    assert "modal app logs piro-training" in workflow
    assert "modal app history piro-training --json" in workflow
    assert "MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}" in workflow
    assert "MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}" in workflow
    assert "borealis-training-diagnostics-${{ github.sha }}" in workflow
    assert "training-deploy.log" in workflow
    assert "training-app.log" in workflow
    assert "training-history.json" in workflow
    assert "if: always()" in workflow


def test_gemma_proxy_captures_redacted_failure_diagnostics():
    source = (MODAL_DIR / "gemma_proxy.py").read_text()
    assert "CUDA_LAUNCH_BLOCKING" in source
    assert "TORCH_SHOW_CPP_STACKTRACES" in source
    assert "PYTHONFAULTHANDLER" in source
    assert "bodySha256" in source
    assert "messageContentBytes" in source
    assert '"recentVllmLogs"' in source
    assert '"text": response' not in source
    assert 'DIAGNOSTICS_PREFIX = "diagnostics/gemma/"' in source
    assert "inference_http_error" in source
    assert "vllm_process_exit" in source
    assert "self._log_thread.join(timeout=2)" in source
    assert "_last_capture_by_kind" in source


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
    assert "Smoke-test Gemma generation" in workflow
    assert "gemma-generation.json" in workflow
    assert workflow.count("if: always()") >= 2


def test_gemma_admin_diagnostics_surface_is_protected_and_discoverable():
    listing = (Path(__file__).parents[1] / "src/app/api/admin/gemma-diagnostics/route.ts").read_text()
    download = (Path(__file__).parents[1] / "src/app/api/admin/gemma-diagnostics/[...key]/route.ts").read_text()
    navigation = (Path(__file__).parents[1] / "src/app/(app)/admin/AdminShell.tsx").read_text()
    assert "requestAuth.isAdmin" in listing
    assert "requestAuth.isAdmin" in download
    assert '"/admin/gemma-diagnostics"' in navigation


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


def test_training_auto_resumes_from_deadline_checkpoint_with_a_bounded_limit():
    common = (MODAL_DIR / "_common.py").read_text()
    training = (MODAL_DIR / "training.py").read_text()
    schema = (Path(__file__).parents[1] / "data" / "schema.ts").read_text()
    serializer = (Path(__file__).parents[1] / "src" / "lib" / "training-runs.server.ts").read_text()

    assert "MAX_AUTO_RESUME_ATTEMPTS = 8" in common
    assert '"resumeAttempts", "configJson" FROM training_run WHERE id = %s' in training
    assert '"resumeAttempts" = "resumeAttempts" + 1' in training
    assert '"modelConfig": model.config_dict()' in training
    assert 'resume checkpoint is missing the persisted model configuration' in training
    assert 'scheduled automatic resume attempt' in training
    assert 'resume=True' in training
    assert 'now + timedelta(seconds=TRAINING_DEADLINE_SECONDS)' in training
    assert 'automatic resume limit reached' in training
    assert 'resumeAttempts: integer("resumeAttempts").notNull().default(0)' in schema
    assert 'resumeAttempts: run.resumeAttempts' in serializer


def test_training_checkpoints_after_every_optimizer_step():
    source = (MODAL_DIR / "_common.py").read_text()

    assert "CHECKPOINT_INTERVAL_STEPS = 1" in source


def test_training_has_no_inference_like_evaluation_path():
    training = (MODAL_DIR / "training.py").read_text()
    generic_trainer = (Path(__file__).parents[1] / "architectures" / "_common" / "trainer.py").read_text()

    for source in (training, generic_trainer):
        assert "evaluate(" not in source
        assert "val_data" not in source
        assert "eval_interval" not in source
        assert "valLoss" not in source
        assert "valAccuracy" not in source
    assert '"finalValLoss"' not in training
    assert '"finalValAccuracy"' not in training


def test_training_dispatch_has_a_bounded_timeout():
    source = (Path(__file__).parents[1] / "src" / "app" / "api" / "training-runs" / "route.ts").read_text()
    assert "signal: AbortSignal.timeout(30_000)" in source
    assert 'Modal trigger timed out after 30 seconds.' in source


def test_training_resume_api_and_cli_surface():
    route = (
        Path(__file__).parents[1]
        / "src"
        / "app"
        / "api"
        / "training-runs"
        / "[id]"
        / "resume"
        / "route.ts"
    ).read_text()
    cli_training = (
        Path(__file__).parents[1] / "cli" / "src" / "commands" / "training.ts"
    ).read_text()
    cli_index = (Path(__file__).parents[1] / "cli" / "src" / "index.ts").read_text()

    assert "export async function POST" in route
    assert 'eq(trainingRun.status, "error")' in route
    assert 'resume: true' in route
    assert "TRAINING_WORKER_LEASE_MS" in route
    assert 'method: "POST"' in cli_training
    assert '/resume' in cli_training
    assert 'case "resume"' in cli_index
    assert 'piro training resume <id>' in cli_index

def test_training_failure_diagnostics_are_persisted_and_exposed():
    training = (MODAL_DIR / "training.py").read_text()
    heartbeat = (MODAL_DIR.parent / "platform_training_state.py").read_text()
    schema = (Path(__file__).parents[1] / "data" / "schema.ts").read_text()
    serializer = (Path(__file__).parents[1] / "src" / "lib" / "training-runs.server.ts").read_text()
    observability = (
        Path(__file__).parents[1]
        / "src"
        / "lib"
        / "training-run-observability.server.ts"
    ).read_text()
    stream = (
        Path(__file__).parents[1]
        / "src"
        / "app"
        / "api"
        / "training-runs"
        / "[id]"
        / "stream"
        / "route.ts"
    ).read_text()

    assert 'workerDiagnosticsJson: text("workerDiagnosticsJson")' in schema
    assert 'failureDetailsJson: text("failureDetailsJson")' in schema
    assert 'workerEventLogJson: text("workerEventLogJson")' in schema
    assert '"workerEventLogJson" = %s' in heartbeat
    assert 'persist_worker_event' in training
    assert 'worker_method_entered' in training
    assert 'worker_startup_failed' in training
    assert 'container setup failed' in training
    assert 'flush=True' in training
    assert '"workerDiagnosticsJson" = %s' in training
    assert '"failureDetailsJson" = %s' in training
    assert 'traceback.format_exc(limit=50)' in training
    assert 'faulthandler.dump_traceback_later' in training
    assert 'faulthandler.register(signal.SIGUSR1' in training
    assert 'checkpoint_restore_watchdog_setup_started' in training
    assert 'checkpoint_restore_watchdog_thread_entered' in training
    assert 'checkpoint_restore_traceback_dump_setup_completed' in training
    assert 'checkpoint_restore_watchdog_thread_started' in training
    assert 'checkpoint_restore_watchdog' in training
    assert 'checkpoint_restore_started' in training
    assert 'checkpoint_stage_started' in training
    assert 'checkpoint_stage_completed' in training
    assert 'checkpoint_stage_failed' in training
    assert 'checkpoint_ready' in training
    assert 'checkpoint_cuda_rng_restored' in training
    assert 'connect_timeout=5' in training
    assert 'statement_timeout=5000' in training
    assert 'memoryRssMb' in training
    assert 'configuredMemoryMb' in training
    assert 'cgroupMemoryLimitMb' in training
    assert 'cgroupMemoryCurrentMb' in training
    assert '"memoryMb" = %s' in training
    assert 'nonlocal checkpoint_payload' in training
    assert 'checkpoint_payload["model"]' in training
    assert 'HEARTBEAT_DIAGNOSTICS_SQL' in heartbeat
    assert "workerDiagnosticsJson: run.workerDiagnosticsJson" in serializer
    assert "failureDetailsJson: run.failureDetailsJson" in serializer
    assert "workerEventLogJson: run.workerEventLogJson" in serializer
    assert "workerEvents" in observability
    assert "lastWorkerEvent" in observability
    assert "workerEventLogJson" in stream
    assert "failureDetailsJson" in stream
