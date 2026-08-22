"""Generic Modal training orchestration for Piro architectures and sources."""

from __future__ import annotations

from datetime import UTC

import modal
from _common import (
    CHECKPOINT_INTERVAL_STEPS,
    CHECKPOINT_SAFETY_SECONDS,
    CHECKPOINT_UPLOAD_ATTEMPTS,
    CHECKPOINT_UPLOAD_BACKOFF_SECONDS,
    CPU_RATE_USD_PER_CORE_SECOND,
    GPU_RATE_USD_PER_SECOND,
    HEARTBEAT_INTERVAL_SECONDS,
    MEMORY_RATE_USD_PER_GIB_SECOND,
    MAX_AUTO_RESUME_ATTEMPTS,
    R2_BUCKET,
    TRAINING_APP,
    TRAINING_CPU,
    TRAINING_DEADLINE_SECONDS,
    TRAINING_GPU,
    TRAINING_MEMORY_MB,
    TRAINING_TIMEOUT_SECONDS,
    _r2_client,
    image,
    piro_secrets,
    trigger_image,
)

app = modal.App(TRAINING_APP)

DEBUG_ENV = {
    "CUDA_LAUNCH_BLOCKING": "1",
    "TORCH_SHOW_CPP_STACKTRACES": "1",
    "PYTHONFAULTHANDLER": "1",
}

# The run timeline is a lifecycle record, not a high-volume worker log sink.
# Detailed phase telemetry remains available in Modal logs and the latest
# heartbeat diagnostics for debugging without overwhelming the user-facing UI.
WORKER_TIMELINE_EVENT_NAMES = {
    "run_claimed": "started",
    "checkpoint_saved": "checkpointed",
    "complete": "succeeded",
}


@app.cls(
    image=image,
    secrets=[piro_secrets],
    gpu=TRAINING_GPU,
    cpu=TRAINING_CPU,
    memory=TRAINING_MEMORY_MB,
    timeout=TRAINING_TIMEOUT_SECONDS,
)
class Trainer:
    @modal.enter()
    def setup(self):
        """Load only generic architecture and source discovery code during container startup."""
        import traceback

        try:
            import torch
            from architectures._common import load_architecture
            from sources._common.training import load_source_examples
        except BaseException:
            print("[piro] container setup failed", flush=True)
            traceback.print_exc()
            raise

        self._torch = torch
        self._load_architecture = load_architecture
        self._load_source_examples = load_source_examples
        print("[piro] container ready — torch + architecture/source loaders loaded", flush=True)

    @modal.method()
    def run(
        self,
        run_id: str,
        model_name: str | None,
        architecture_path: str,
        source_path: str,
        dataset_r2_prefix: str,
        max_steps: int,
        seed: int,
        resume: bool = False,
        debug: bool = False,
    ) -> None:
        import faulthandler
        import io
        import json
        import os
        import random
        import resource
        import signal
        import socket
        import sys
        import threading
        import time
        import traceback
        import uuid as _uuid
        from datetime import datetime, timedelta

        import psycopg2
        from platform_serialization import round_nested_numbers
        from platform_training_state import heartbeat_loop, persist_worker_event

        torch = self._torch
        device = None
        faulthandler.enable(file=sys.stderr, all_threads=True)
        print(f"[piro] run {run_id} entered worker method", flush=True)

        def _connect_database(database_url: str):
            return psycopg2.connect(
                database_url,
                connect_timeout=5,
                options="-c statement_timeout=5000",
            )

        def _estimate_cost_usd(runtime_ms: int) -> float:
            seconds = max(0, runtime_ms) / 1000.0
            return round(
                seconds
                * (
                    GPU_RATE_USD_PER_SECOND
                    + CPU_RATE_USD_PER_CORE_SECOND * TRAINING_CPU
                    + MEMORY_RATE_USD_PER_GIB_SECOND * (TRAINING_MEMORY_MB / 1024)
                ),
                6,
            )

        now = datetime.now(UTC)
        worker_id = os.environ.get("MODAL_TASK_ID") or socket.gethostname()
        diagnostics_lock = threading.Lock()
        diagnostics_state = {
            "schemaVersion": 1,
            "runId": run_id,
            "workerId": worker_id,
            "pid": os.getpid(),
            "resume": resume,
            "debug": debug,
            "resumeAttempts": 0,
            "maxSteps": max_steps,
            "phase": "starting",
            "step": 0,
            "checkpointStep": 0,
            "checkpointKey": None,
            "updatedAt": now.isoformat(),
        }

        def _memory_rss_mb() -> float | None:
            try:
                # Linux reports ru_maxrss in KiB; keep this portable for local tests.
                return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
            except (AttributeError, OSError, ValueError):
                return None

        def _cgroup_memory_mb(filename: str) -> float | None:
            for path in (
                f"/sys/fs/cgroup/{filename}",
                f"/sys/fs/cgroup/memory/{filename}",
            ):
                try:
                    with open(path, encoding="utf-8") as handle:
                        raw = handle.read().strip()
                except (FileNotFoundError, OSError):
                    continue
                if raw in {"", "max"}:
                    return None
                try:
                    return round(int(raw) / (1024 * 1024), 1)
                except ValueError:
                    return None
            return None

        def _resource_diagnostics() -> dict[str, object]:
            result: dict[str, object] = {
                "configuredMemoryMb": TRAINING_MEMORY_MB,
            }
            rss_mb = _memory_rss_mb()
            if rss_mb is not None:
                result["memoryRssMb"] = rss_mb
            limit_mb = _cgroup_memory_mb("memory.max")
            if limit_mb is None:
                limit_mb = _cgroup_memory_mb("memory.limit_in_bytes")
            if limit_mb is not None:
                result["cgroupMemoryLimitMb"] = limit_mb
            current_mb = _cgroup_memory_mb("memory.current")
            if current_mb is None:
                current_mb = _cgroup_memory_mb("memory.usage_in_bytes")
            if current_mb is not None:
                result["cgroupMemoryCurrentMb"] = current_mb
            return result

        def _diagnostics_json() -> str:
            with diagnostics_lock:
                diagnostics_state.update(_resource_diagnostics())
                return json.dumps(diagnostics_state, separators=(",", ":"))

        def _set_diagnostics(phase: str, **updates: object) -> None:
            with diagnostics_lock:
                diagnostics_state.update(updates)
                diagnostics_state["phase"] = phase
                diagnostics_state["updatedAt"] = datetime.now(UTC).isoformat()

        def _record_event(event: str, **details: object) -> None:
            rss_mb = _memory_rss_mb()
            payload = {
                "event": event,
                "observedAt": datetime.now(UTC).isoformat(),
                "phase": diagnostics_state.get("phase"),
                "step": diagnostics_state.get("step"),
                **_resource_diagnostics(),
                **details,
            }
            canonical_event = WORKER_TIMELINE_EVENT_NAMES.get(event)
            if event.endswith("_failed"):
                canonical_event = "failed"
            if canonical_event is None:
                print(
                    f"[piro] run {run_id} worker telemetry: "
                    f"{json.dumps(payload, separators=(',', ':'))}",
                    flush=True,
                )
                return
            payload["event"] = canonical_event
            payload["sourceEvent"] = event
            try:
                persisted = persist_worker_event(
                    _connect_database,
                    os.environ["DATABASE_URL"],
                    run_id,
                    payload,
                    diagnostics_json=_diagnostics_json(),
                )
                if not persisted:
                    print(f"[piro] run {run_id} event not persisted: {event}", flush=True)
            except BaseException as event_error:
                print(
                    f"[piro] run {run_id} event persistence failed for {event}: "
                    f"{type(event_error).__name__}: {event_error}",
                    flush=True,
                )

        def _handle_worker_signal(signum: int, _frame: object) -> None:
            signal_name = signal.Signals(signum).name
            print(
                f"[piro] run {run_id} received {signal_name}; recording termination breadcrumb",
                flush=True,
            )
            _set_diagnostics("terminated", terminationSignal=signal_name)
            _record_event("worker_signal_received", signal=signal_name)
            raise RuntimeError(f"worker received {signal_name}")

        for signal_number in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signal_number, _handle_worker_signal)
        if hasattr(signal, "SIGUSR1"):
            faulthandler.register(signal.SIGUSR1, file=sys.stderr, all_threads=True)

        _record_event("worker_method_entered")
        conn = None
        cur = None
        try:
            _record_event("database_connecting")
            conn = _connect_database(os.environ["DATABASE_URL"])
            cur = conn.cursor()
            _record_event("database_connected")
            cur.execute(
                'SELECT "userId", "checkpointR2Key", "checkpointStep", "startedAt", "timeoutAt", '
                '"resumeAttempts", "configJson" FROM training_run WHERE id = %s',
                (run_id,),
            )
            row = cur.fetchone()
            _record_event("run_metadata_loaded", found=row is not None)
        except BaseException as exc:
            _record_event(
                "worker_startup_failed",
                exceptionType=type(exc).__name__,
                message=str(exc)[:2000],
                traceback=traceback.format_exc(limit=50)[-12000:],
            )
            print(f"[piro] run {run_id} database preflight failed", flush=True)
            traceback.print_exc()
            if cur is not None:
                cur.close()
            if conn is not None:
                conn.close()
            raise
        user_id: str = row[0] if row else ""
        checkpoint_key: str | None = row[1] if row else None
        checkpoint_step: int = int(row[2] or 0) if row else 0
        persisted_started_at = row[3] if row else None
        started_at = persisted_started_at or now
        resume_attempts: int = int(row[5] or 0) if row else 0
        persisted_config = row[6] if row and row[6] else None
        if isinstance(persisted_config, str):
            persisted_config = json.loads(persisted_config)
        if persisted_config is not None and not isinstance(persisted_config, dict):
            raise RuntimeError("training run configJson must be an object")
        timeout_at = (
            now + timedelta(seconds=TRAINING_DEADLINE_SECONDS)
            if resume
            else started_at + timedelta(seconds=TRAINING_DEADLINE_SECONDS)
        )
        with diagnostics_lock:
            diagnostics_state.update(
                resumeAttempts=resume_attempts,
                step=checkpoint_step,
                checkpointStep=checkpoint_step,
                checkpointKey=checkpoint_key,
            )

        try:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            _record_event(
                "device_probe_complete",
                cudaAvailable=device.type == "cuda",
                device=str(device),
                gpuType=TRAINING_GPU,
            )
            if device.type != "cuda":
                raise RuntimeError("Modal training requires CUDA; no GPU was attached")
            print(f"[piro] run {run_id} using device={device} gpu={TRAINING_GPU}", flush=True)
        except BaseException as exc:
            _record_event(
                "worker_startup_failed",
                exceptionType=type(exc).__name__,
                message=str(exc)[:2000],
                traceback=traceback.format_exc(limit=50)[-12000:],
            )
            print(f"[piro] run {run_id} startup probe failed", flush=True)
            traceback.print_exc()
            raise

        initial_diagnostics = _diagnostics_json()
        if resume:
            cur.execute(
                'UPDATE training_run SET "heartbeatAt" = %s, "resourceType" = %s, '
                '"gpuType" = %s, "cpuCores" = %s, "memoryMb" = %s, '
                '"workerDiagnosticsJson" = %s, "failureDetailsJson" = NULL '
                'WHERE id = %s AND status = %s',
                (
                    now,
                    "gpu",
                    TRAINING_GPU,
                    TRAINING_CPU,
                    TRAINING_MEMORY_MB,
                    initial_diagnostics,
                    run_id,
                    "running",
                ),
            )
        else:
            cur.execute(
                'UPDATE training_run SET status = %s, "startedAt" = %s, "heartbeatAt" = %s, '
                '"timeoutAt" = %s, "resourceType" = %s, "gpuType" = %s, "cpuCores" = %s, '
                '"memoryMb" = %s, "workerDiagnosticsJson" = %s, "failureDetailsJson" = NULL '
                'WHERE id = %s AND status = %s',
                (
                    "running",
                    started_at,
                    now,
                    timeout_at,
                    "gpu",
                    TRAINING_GPU,
                    TRAINING_CPU,
                    TRAINING_MEMORY_MB,
                    initial_diagnostics,
                    run_id,
                    "queued",
                ),
            )
        if cur.rowcount != 1:
            _record_event("run_not_claimable")
            conn.rollback()
            cur.close()
            conn.close()
            print(f"[piro] run {run_id} was not claimable; skipping worker")
            return
        conn.commit()
        _record_event("run_claimed")

        heartbeat_stop = threading.Event()
        lease_lost = threading.Event()
        heartbeat_thread = threading.Thread(
            target=heartbeat_loop,
            kwargs={
                "stop_event": heartbeat_stop,
                "lease_lost_event": lease_lost,
                "connect": _connect_database,
                "database_url": os.environ["DATABASE_URL"],
                "run_id": run_id,
                "interval_seconds": HEARTBEAT_INTERVAL_SECONDS,
                "diagnostics": _diagnostics_json,
            },
            name=f"piro-heartbeat-{run_id[:8]}",
            daemon=True,
        )
        heartbeat_thread.start()
        _record_event("heartbeat_thread_started")

        def _stop_heartbeat() -> None:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=5)

        def _ensure_lease() -> None:
            if lease_lost.is_set():
                raise RuntimeError("training run lease was lost while the worker was running")

        checkpoint_watchdog_stop = threading.Event()
        checkpoint_stage_lock = threading.Lock()
        checkpoint_stage = {"name": None, "startedAt": None}
        checkpoint_watchdog_thread = None
        checkpoint_watchdog_active = False
        training_watchdog_stop = threading.Event()
        training_stage_lock = threading.Lock()
        training_stage = {"name": None, "startedAt": None, "step": None}
        training_watchdog_thread = None
        training_watchdog_active = False

        def _set_checkpoint_stage(name: str | None) -> None:
            started_at = datetime.now(UTC).isoformat() if name else None
            with checkpoint_stage_lock:
                checkpoint_stage["name"] = name
                checkpoint_stage["startedAt"] = started_at
            _set_diagnostics(
                diagnostics_state.get("phase", "building_model"),
                checkpointStage=name,
                checkpointStageStartedAt=started_at,
            )

        def _checkpoint_watchdog() -> None:
            _record_event("checkpoint_restore_watchdog_thread_entered")
            while not checkpoint_watchdog_stop.wait(30):
                with checkpoint_stage_lock:
                    name = checkpoint_stage["name"]
                    started = checkpoint_stage["startedAt"]
                if not name:
                    continue
                elapsed_seconds = None
                if started:
                    elapsed_seconds = round(
                        max(
                            0,
                            (
                                datetime.now(UTC)
                                - datetime.fromisoformat(str(started))
                            ).total_seconds(),
                        ),
                        1,
                    )
                _record_event(
                    "checkpoint_restore_watchdog",
                    stage=name,
                    elapsedSeconds=elapsed_seconds,
                )
                faulthandler.dump_traceback(file=sys.stderr, all_threads=True)

        def _start_checkpoint_watchdog() -> None:
            nonlocal checkpoint_watchdog_thread, checkpoint_watchdog_active
            print(f"[piro] run {run_id} checkpoint watchdog setup started", flush=True)
            checkpoint_watchdog_active = True
            _set_checkpoint_stage("starting")
            _record_event("checkpoint_restore_watchdog_setup_started")
            _record_event("checkpoint_restore_watchdog_armed")
            print(f"[piro] run {run_id} checkpoint watchdog event persisted", flush=True)
            _record_event("checkpoint_restore_traceback_dump_setup_started")
            faulthandler.dump_traceback_later(
                60,
                repeat=True,
                file=sys.stderr,
            )
            _record_event("checkpoint_restore_traceback_dump_setup_completed")
            checkpoint_watchdog_thread = threading.Thread(
                target=_checkpoint_watchdog,
                name=f"piro-checkpoint-watchdog-{run_id[:8]}",
                daemon=True,
            )
            _record_event("checkpoint_restore_watchdog_thread_starting")
            checkpoint_watchdog_thread.start()
            _record_event("checkpoint_restore_watchdog_thread_started")
            print(f"[piro] run {run_id} checkpoint watchdog setup completed", flush=True)

        def _stop_checkpoint_watchdog(*, record_event: bool = True) -> None:
            nonlocal checkpoint_watchdog_active
            if not checkpoint_watchdog_active:
                return
            checkpoint_watchdog_active = False
            checkpoint_watchdog_stop.set()
            faulthandler.cancel_dump_traceback_later()
            _set_checkpoint_stage(None)
            if checkpoint_watchdog_thread is not None:
                checkpoint_watchdog_thread.join(timeout=5)
            if record_event:
                _record_event("checkpoint_restore_watchdog_stopped")

        def _set_training_stage(
            name: str | None,
            *,
            step: int | None = None,
            **details: object,
        ) -> None:
            started_at = datetime.now(UTC).isoformat() if name else None
            with training_stage_lock:
                training_stage["name"] = name
                training_stage["startedAt"] = started_at
                training_stage["step"] = step
            _set_diagnostics(
                diagnostics_state.get("phase", "training"),
                trainPhase=name,
                trainPhaseStartedAt=started_at,
                trainPhaseStep=step,
                **details,
            )

        def _thread_stacks() -> dict[str, str]:
            frames = sys._current_frames()
            names = {thread.ident: thread.name for thread in threading.enumerate()}
            stacks: dict[str, str] = {}
            for thread_id, frame in frames.items():
                name = names.get(thread_id, f"thread-{thread_id}")
                stacks[name] = "".join(traceback.format_stack(frame))[-4000:]
            return stacks

        def _training_watchdog() -> None:
            _record_event("training_watchdog_thread_entered")
            while not training_watchdog_stop.wait(30):
                with training_stage_lock:
                    name = training_stage["name"]
                    started = training_stage["startedAt"]
                    step = training_stage["step"]
                if not name:
                    continue
                elapsed_seconds = None
                if started:
                    elapsed_seconds = round(
                        max(
                            0,
                            (
                                datetime.now(UTC)
                                - datetime.fromisoformat(str(started))
                            ).total_seconds(),
                        ),
                        1,
                    )
                _record_event(
                    "training_watchdog",
                    trainPhase=name,
                    step=step,
                    elapsedSeconds=elapsed_seconds,
                    threadStacks=_thread_stacks(),
                )
                faulthandler.dump_traceback(file=sys.stderr, all_threads=True)

        def _start_training_watchdog() -> None:
            nonlocal training_watchdog_thread, training_watchdog_active
            training_watchdog_active = True
            _record_event("training_watchdog_setup_started")
            training_watchdog_thread = threading.Thread(
                target=_training_watchdog,
                name=f"piro-training-watchdog-{run_id[:8]}",
                daemon=True,
            )
            training_watchdog_thread.start()
            _record_event("training_watchdog_started")

        def _stop_training_watchdog(*, record_event: bool = True) -> None:
            nonlocal training_watchdog_active
            if not training_watchdog_active:
                return
            training_watchdog_active = False
            training_watchdog_stop.set()
            _set_training_stage(None)
            if training_watchdog_thread is not None:
                training_watchdog_thread.join(timeout=5)
            if record_event:
                _record_event("training_watchdog_stopped")

        model = None
        optimizer = None
        try:
            _set_diagnostics("loading_data")
            _record_event("loading_data_entered")
            random.seed(seed)
            torch.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)
            architecture_class = self._load_architecture(architecture_path)
            _record_event("architecture_loader_ready")
            r2 = _r2_client(os)
            _record_event("storage_client_ready")
            train_data = self._load_source_examples(
                source_path=source_path,
                r2_client=r2,
                bucket=R2_BUCKET,
                prefix=dataset_r2_prefix,
                split="train",
                limit=500,
            )
            if not train_data:
                raise ValueError("training dataset is empty")
            _record_event("dataset_loaded", trainExamples=len(train_data))

            checkpoint_payload: dict | None = None
            if checkpoint_key:
                _set_diagnostics("loading_checkpoint", checkpointStep=checkpoint_step, checkpointKey=checkpoint_key)
                response = r2.get_object(Bucket=R2_BUCKET, Key=checkpoint_key)
                checkpoint_payload = torch.load(
                    io.BytesIO(response["Body"].read()),
                    map_location=device,
                    weights_only=False,
                )
                _record_event("checkpoint_payload_loaded", checkpointStep=checkpoint_step)
                checkpoint_envelope = checkpoint_payload.get("config", {})
                for key, expected in {
                    "architecturePath": architecture_path,
                    "sourcePath": source_path,
                    "datasetR2Prefix": dataset_r2_prefix,
                }.items():
                    if checkpoint_envelope.get(key) != expected:
                        raise RuntimeError(f"checkpoint {key} does not match this run")

            _set_diagnostics("building_model", trainExamples=len(train_data))
            _record_event("model_build_started")
            model_config = dict(persisted_config or {}) if resume else {}
            if not model_config:
                model_config = dict((checkpoint_payload or {}).get("config", {}).get("modelConfig", {}))
            if checkpoint_key and not model_config:
                raise RuntimeError("resume checkpoint is missing the persisted model configuration")
            if not model_config:
                model_config = architecture_class.config_for_training(train_data)
            model = architecture_class.from_config(model_config).to(device)
            _record_event("model_built")
            optimizer = torch.optim.Adam(model.parameters(), **model.optimizer_kwargs())
            _record_event("optimizer_built")

            config_dict = {
                **model.config_dict(),
                "architecturePath": architecture_path,
                "sourcePath": source_path,
                "datasetR2Prefix": dataset_r2_prefix,
                "maxSteps": max_steps,
                "debug": debug,
                "checkpointIntervalSteps": CHECKPOINT_INTERVAL_STEPS,
            }
            cur.execute(
                'UPDATE training_run SET "configJson" = %s WHERE id = %s',
                (json.dumps(config_dict), run_id),
            )
            conn.commit()

            order = list(range(len(train_data)))
            cursor = 0
            start_step = 0

            def _restore_optimizer_device() -> None:
                for state in optimizer.state.values():
                    for key, value in state.items():
                        if hasattr(value, "to"):
                            state[key] = value.to(device)

            def _normalize_cuda_rng_states(raw_state):
                """Convert old and new checkpoint RNG shapes to CPU uint8 tensors."""
                if raw_state is None:
                    return None
                states = raw_state if isinstance(raw_state, (list, tuple)) else [raw_state]
                normalized = []
                for index, state in enumerate(states):
                    try:
                        tensor = state.detach() if isinstance(state, torch.Tensor) else torch.as_tensor(state)
                        tensor = tensor.to(device="cpu", dtype=torch.uint8)
                    except (TypeError, RuntimeError, ValueError) as exc:
                        raise TypeError(
                            f"checkpoint CUDA RNG state {index} cannot be normalized: "
                            f"{type(state).__name__}"
                        ) from exc
                    if tensor.ndim != 1:
                        raise TypeError(
                            f"checkpoint CUDA RNG state {index} must be 1-dimensional, "
                            f"got shape {tuple(tensor.shape)}"
                        )
                    normalized.append(tensor.contiguous())
                if not normalized:
                    raise TypeError("checkpoint CUDA RNG state is empty")
                return normalized

            def _restore_stage(name: str, operation):
                _set_checkpoint_stage(name)
                _record_event("checkpoint_stage_started", stage=name)
                try:
                    result = operation()
                except BaseException as exc:
                    _record_event(
                        "checkpoint_stage_failed",
                        stage=name,
                        exceptionType=type(exc).__name__,
                        message=str(exc)[:2000],
                        traceback=traceback.format_exc(limit=50)[-12000:],
                    )
                    raise
                _record_event("checkpoint_stage_completed", stage=name)
                return result

            def _load_checkpoint() -> None:
                nonlocal checkpoint_payload, order, cursor, start_step
                _start_checkpoint_watchdog()
                if not checkpoint_key:
                    _record_event("checkpoint_restore_started", checkpointStep=0)
                    _set_diagnostics("checkpoint_ready", checkpointStep=0)
                    _record_event("checkpoint_ready", checkpointStep=0)
                    _stop_checkpoint_watchdog()
                    return

                if checkpoint_payload is None:
                    _set_diagnostics("loading_checkpoint", checkpointStep=checkpoint_step, checkpointKey=checkpoint_key)
                    response = r2.get_object(Bucket=R2_BUCKET, Key=checkpoint_key)
                    checkpoint_payload = torch.load(
                        io.BytesIO(response["Body"].read()),
                        map_location=device,
                        weights_only=False,
                    )
                    _record_event("checkpoint_payload_loaded", checkpointStep=checkpoint_step)
                checkpoint_config = checkpoint_payload.get("config", {})
                for key, expected in {
                    "architecturePath": architecture_path,
                    "sourcePath": source_path,
                    "datasetR2Prefix": dataset_r2_prefix,
                }.items():
                    if checkpoint_config.get(key) != expected:
                        raise RuntimeError(f"checkpoint {key} does not match this run")
                _record_event("checkpoint_restore_started", checkpointStep=checkpoint_step)
                _restore_stage(
                    "model_state",
                    lambda: model.load_model_state(checkpoint_payload["model"]),
                )
                _record_event("checkpoint_model_state_loaded", checkpointStep=checkpoint_step)
                _restore_stage(
                    "optimizer_state",
                    lambda: optimizer.load_state_dict(checkpoint_payload["optimizer"]),
                )
                _record_event("checkpoint_optimizer_state_loaded", checkpointStep=checkpoint_step)
                _restore_stage(
                    "runtime_state",
                    lambda: model.load_checkpoint_state(checkpoint_payload.get("runtime", {})),
                )
                _record_event("checkpoint_runtime_state_loaded", checkpointStep=checkpoint_step)
                _restore_stage("optimizer_device", _restore_optimizer_device)
                _record_event("checkpoint_optimizer_device_restored", checkpointStep=checkpoint_step)

                def _restore_progress_state() -> None:
                    nonlocal order, cursor, start_step
                    order = list(checkpoint_payload.get("order", order))
                    cursor = int(checkpoint_payload.get("cursor", 0))
                    start_step = int(checkpoint_payload.get("step", checkpoint_step))

                _restore_stage("progress_state", _restore_progress_state)
                _record_event("checkpoint_progress_state_loaded", checkpointStep=start_step)

                def _validate_dataset_order() -> None:
                    if len(order) != len(train_data):
                        raise RuntimeError("checkpoint dataset ordering does not match current data")

                _restore_stage("dataset_order", _validate_dataset_order)
                _record_event("checkpoint_dataset_order_validated", checkpointStep=start_step)
                _restore_stage(
                    "python_rng",
                    lambda: random.setstate(checkpoint_payload["pythonRandomState"]),
                )
                _record_event("checkpoint_python_rng_restored", checkpointStep=start_step)
                _restore_stage(
                    "torch_rng",
                    lambda: torch.set_rng_state(checkpoint_payload["torchRandomState"].cpu()),
                )
                _record_event("checkpoint_torch_rng_restored", checkpointStep=start_step)
                if device.type == "cuda" and checkpoint_payload.get("cudaRandomState") is not None:
                    def _restore_cuda_rng() -> None:
                        normalized_states = _normalize_cuda_rng_states(
                            checkpoint_payload["cudaRandomState"]
                        )
                        torch.cuda.set_rng_state_all(normalized_states)
                        torch.cuda.synchronize(device)

                    _restore_stage("cuda_rng", _restore_cuda_rng)
                    _record_event("checkpoint_cuda_rng_restored", checkpointStep=start_step)
                _record_event("checkpoint_restored", checkpointStep=start_step)
                _set_diagnostics(
                    "checkpoint_ready",
                    step=start_step,
                    checkpointStep=start_step,
                    checkpointKey=checkpoint_key,
                )
                _record_event("checkpoint_ready", checkpointStep=start_step)
                _stop_checkpoint_watchdog()
                print(f"[piro] resumed run {run_id} from checkpoint step {start_step}")

            def _checkpoint_stage(name: str, operation):
                _set_checkpoint_stage(name)
                _record_event("checkpoint_stage_started", stage=name)
                try:
                    result = operation()
                except BaseException as exc:
                    _record_event(
                        "checkpoint_stage_failed",
                        stage=name,
                        exceptionType=type(exc).__name__,
                        message=str(exc)[:2000],
                        traceback=traceback.format_exc(limit=50)[-12000:],
                    )
                    raise
                _record_event("checkpoint_stage_completed", stage=name)
                return result

            def _persist_checkpoint_metadata(
                key: str, step: int, checkpointed_at: datetime
            ) -> None:
                cur.execute(
                    """
                    UPDATE training_run
                    SET "checkpointR2Key" = %s,
                        "checkpointStep" = %s,
                        "checkpointAt" = %s,
                        "heartbeatAt" = %s
                    WHERE id = %s AND status = 'running'
                    """,
                    (key, step, checkpointed_at, checkpointed_at, run_id),
                )
                if cur.rowcount != 1:
                    conn.rollback()
                    raise RuntimeError("training run became terminal while checkpointing")
                conn.commit()

            def _save_checkpoint(step: int) -> None:
                _set_diagnostics("checkpointing", step=step)
                _start_checkpoint_watchdog()
                try:
                    _checkpoint_stage(
                        "cuda_sync",
                        lambda: torch.cuda.synchronize(device)
                        if device.type == "cuda"
                        else None,
                    )
                    payload = _checkpoint_stage(
                        "payload_build",
                        lambda: {
                            "version": 2,
                            "step": step,
                            "model": model.state_dict(),
                            "optimizer": optimizer.state_dict(),
                            "runtime": model.checkpoint_state(),
                            "order": order,
                            "cursor": cursor,
                            "pythonRandomState": random.getstate(),
                            "torchRandomState": torch.get_rng_state(),
                            "cudaRandomState": (
                                [
                                    state.cpu().to(dtype=torch.uint8).contiguous()
                                    for state in torch.cuda.get_rng_state_all()
                                ]
                                if device.type == "cuda"
                                else None
                            ),
                            "config": {
                                "maxSteps": max_steps,
                                "seed": seed,
                                "architecturePath": architecture_path,
                                "sourcePath": source_path,
                                "datasetR2Prefix": dataset_r2_prefix,
                                "modelConfig": model.config_dict(),
                            },
                        },
                    )
                    buffer = _checkpoint_stage("serialize", io.BytesIO)
                    _checkpoint_stage(
                        "serialize_payload",
                        lambda: torch.save(payload, buffer),
                    )
                    key = f"checkpoints/{run_id}/step-{step}.pt"
                    checkpoint_bytes = buffer.getvalue()

                    def _upload_checkpoint() -> None:
                        last_error = None
                        for attempt in range(1, CHECKPOINT_UPLOAD_ATTEMPTS + 1):
                            try:
                                r2.put_object(
                                    Bucket=R2_BUCKET,
                                    Key=key,
                                    Body=checkpoint_bytes,
                                    ContentType="application/octet-stream",
                                )
                                _record_event(
                                    "checkpoint_upload_succeeded",
                                    step=step,
                                    attempt=attempt,
                                    bytes=len(checkpoint_bytes),
                                )
                                return
                            except Exception as exc:
                                last_error = exc
                                _record_event(
                                    "checkpoint_upload_attempt_failed",
                                    step=step,
                                    attempt=attempt,
                                    exceptionType=type(exc).__name__,
                                    message=str(exc)[:2000],
                                )
                                if attempt < CHECKPOINT_UPLOAD_ATTEMPTS:
                                    time.sleep(
                                        CHECKPOINT_UPLOAD_BACKOFF_SECONDS * attempt
                                    )
                        raise RuntimeError(
                            f"checkpoint upload failed after "
                            f"{CHECKPOINT_UPLOAD_ATTEMPTS} attempts: {last_error}"
                        ) from last_error

                    _checkpoint_stage("upload", _upload_checkpoint)
                    checkpointed_at = datetime.now(UTC)
                    _checkpoint_stage(
                        "metadata_persist",
                        lambda: _persist_checkpoint_metadata(
                            key, step, checkpointed_at
                        ),
                    )
                    if step >= 5:
                        try:
                            _checkpoint_stage(
                                "cleanup_old_checkpoint",
                                lambda: r2.delete_object(
                                    Bucket=R2_BUCKET,
                                    Key=f"checkpoints/{run_id}/step-{step - 5}.pt",
                                ),
                            )
                        except BaseException as exc:
                            _record_event(
                                "checkpoint_cleanup_failed",
                                step=step,
                                exceptionType=type(exc).__name__,
                                message=str(exc)[:2000],
                            )
                            print(
                                f"[piro] run {run_id} checkpoint cleanup failed at step {step}: {exc}",
                                flush=True,
                            )
                    _set_diagnostics(
                        "training",
                        step=step,
                        checkpointStep=step,
                        checkpointKey=key,
                    )
                    _record_event("checkpoint_saved", step=step, checkpointStep=step)
                finally:
                    _stop_checkpoint_watchdog()

            def _next_batch() -> tuple[list, list[int]]:
                nonlocal cursor
                if cursor == 0:
                    random.shuffle(order)
                size = min(model.training_batch_size, len(order))
                indices = [order[(cursor + offset) % len(order)] for offset in range(size)]
                cursor = (cursor + size) % len(order)
                return [train_data[index] for index in indices], indices

            _load_checkpoint()
            _start_training_watchdog()
            if not checkpoint_key and start_step == 0:
                _save_checkpoint(0)
                print(f"[piro] run {run_id} initialized checkpoint at step 0")

            for step in range(start_step + 1, max_steps + 1):
                detailed_telemetry = debug or step == max_steps
                _set_diagnostics("training", step=step)
                if step == checkpoint_step + 1:
                    _record_event("training_entered", step=step)
                now = datetime.now(UTC)
                if now + timedelta(seconds=CHECKPOINT_SAFETY_SECONDS) >= timeout_at:
                    _save_checkpoint(step - 1)
                    _set_diagnostics("handoff", step=step - 1)
                    handoff_at = datetime.now(UTC)
                    if resume_attempts >= MAX_AUTO_RESUME_ATTEMPTS:
                        runtime_ms = max(
                            0,
                            int((min(handoff_at, timeout_at) - started_at).total_seconds() * 1000),
                        )
                        cur.execute(
                            """
                            UPDATE training_run
                            SET status = %s, error = %s, "completedAt" = %s,
                                "workerDiagnosticsJson" = %s, "failureDetailsJson" = %s,
                                "runtimeMs" = %s, "costUsd" = %s, "costBasis" = %s
                            WHERE id = %s AND status = 'running'
                            """,
                            (
                                "error",
                                (
                                    "Training deadline reached; checkpoint saved at step "
                                    f"{step - 1}; automatic resume limit reached."
                                ),
                                handoff_at,
                                _diagnostics_json(),
                                json.dumps({
                                    "kind": "deadline",
                                    "phase": "handoff",
                                    "step": step - 1,
                                    "observedAt": handoff_at.isoformat(),
                                }, separators=(",", ":")),
                                runtime_ms,
                                _estimate_cost_usd(runtime_ms),
                                "modal_standard_estimate",
                                run_id,
                            ),
                        )
                        conn.commit()
                        print(
                            f"[piro] run {run_id} checkpointed at step {step - 1}; "
                            "automatic resume limit reached"
                        )
                        return

                    next_timeout_at = handoff_at + timedelta(seconds=TRAINING_DEADLINE_SECONDS)
                    cur.execute(
                        """
                        UPDATE training_run
                        SET "timeoutAt" = %s, "heartbeatAt" = %s,
                            "resumeAttempts" = "resumeAttempts" + 1,
                            "workerDiagnosticsJson" = %s,
                            "failureDetailsJson" = NULL,
                            error = NULL, "completedAt" = NULL
                        WHERE id = %s AND status = 'running'
                        """,
                        (next_timeout_at, handoff_at, _diagnostics_json(), run_id),
                    )
                    if cur.rowcount != 1:
                        conn.rollback()
                        raise RuntimeError("training run became terminal before automatic resume")
                    conn.commit()
                    try:
                        _trainer_for(debug)().run.spawn(
                            run_id=run_id,
                            model_name=model_name,
                            architecture_path=architecture_path,
                            source_path=source_path,
                            dataset_r2_prefix=dataset_r2_prefix,
                            max_steps=max_steps,
                            seed=seed,
                            resume=True,
                            debug=debug,
                        )
                    except BaseException:
                        cur.execute(
                            """
                            UPDATE training_run
                            SET status = %s, error = %s, "completedAt" = %s,
                                "heartbeatAt" = %s, "workerDiagnosticsJson" = %s,
                                "failureDetailsJson" = %s
                            WHERE id = %s AND status = 'running'
                            """,
                            (
                                "error",
                                (
                                    "Training deadline reached; checkpoint saved at step "
                                    f"{step - 1}, but automatic resume dispatch failed."
                                ),
                                handoff_at,
                                handoff_at,
                                _diagnostics_json(),
                                json.dumps({
                                    "kind": "automatic_resume_dispatch",
                                    "phase": "handoff",
                                    "step": step - 1,
                                    "observedAt": handoff_at.isoformat(),
                                }, separators=(",", ":")),
                                run_id,
                            ),
                        )
                        conn.commit()
                        raise
                    print(
                        f"[piro] run {run_id} checkpointed at step {step - 1}; "
                        f"scheduled automatic resume attempt {resume_attempts + 1}"
                    )
                    return

                if detailed_telemetry:
                    _record_event("batch_preparation_started", step=step)
                _set_diagnostics("batch_preparation", step=step)
                batch, batch_indices = _next_batch()
                if detailed_telemetry:
                    _record_event(
                        "batch_preparation_completed",
                        step=step,
                        batchIndices=batch_indices,
                        batchSize=len(batch),
                    )
                _set_training_stage(
                    "train_step",
                    step=step,
                    batchIndices=batch_indices,
                    batchSize=len(batch),
                )
                _set_diagnostics(
                    "optimizer_step",
                    step=step,
                    batchIndices=batch_indices,
                    batchSize=len(batch),
                )
                if detailed_telemetry:
                    _record_event(
                        "optimizer_step_started",
                        step=step,
                        batchIndices=batch_indices,
                        batchSize=len(batch),
                    )

                def _on_train_phase(name: str, details: dict[str, object]) -> None:
                    _set_training_stage(name, step=step, **details)
                    _record_event("train_phase", trainPhase=name, step=step, **details)

                try:
                    train_loss = model.train_step(
                        batch,
                        optimizer,
                        on_phase=_on_train_phase if detailed_telemetry else None,
                    )
                except BaseException as exc:
                    if detailed_telemetry:
                        _record_event(
                            "optimizer_step_failed",
                            step=step,
                            batchIndices=batch_indices,
                            trainPhase=training_stage.get("name"),
                            exceptionType=type(exc).__name__,
                            message=str(exc)[:2000],
                            traceback=traceback.format_exc(limit=50)[-12000:],
                        )
                    raise
                if detailed_telemetry:
                    _record_event(
                        "optimizer_step_completed",
                        step=step,
                        batchIndices=batch_indices,
                        trainLoss=train_loss,
                    )
                _set_training_stage(None, step=step)
                _ensure_lease()
                if step % CHECKPOINT_INTERVAL_STEPS == 0 or step == max_steps:
                    _save_checkpoint(step)

            _set_diagnostics("publishing_model", step=max_steps)
            _record_event("publishing_started", step=max_steps)
            model_id = str(_uuid.uuid4())
            state = {
                key: value.detach().cpu() for key, value in model.state_dict().items()
            }
            pt_buf = io.BytesIO()
            torch.save(state, pt_buf)
            pt_bytes = pt_buf.getvalue()
            weights_json_str = json.dumps(
                {key: round_nested_numbers(value.tolist()) for key, value in state.items()}
            )
            r2_prefix = f"models/{model_id}"
            r2.put_object(
                Bucket=R2_BUCKET,
                Key=f"{r2_prefix}/weights.pt",
                Body=pt_bytes,
                ContentType="application/octet-stream",
            )
            r2.put_object(
                Bucket=R2_BUCKET,
                Key=f"{r2_prefix}/weights.json",
                Body=weights_json_str.encode("utf-8"),
                ContentType="application/json",
            )

            completed_at = datetime.now(UTC)
            runtime_ms = int((completed_at - started_at).total_seconds() * 1000)
            cur.execute(
                """
                UPDATE training_run
                SET status = %s, "finalTrainLoss" = %s,
                    "completedAt" = %s, "heartbeatAt" = %s,
                    "runtimeMs" = %s, "costUsd" = %s, "costBasis" = %s
                WHERE id = %s AND status = 'running'
                """,
                (
                    "complete",
                    float(train_loss),
                    completed_at,
                    completed_at,
                    runtime_ms,
                    _estimate_cost_usd(runtime_ms),
                    "modal_standard_estimate",
                    run_id,
                ),
            )
            completed_update_count = cur.rowcount
            conn.commit()
            if completed_update_count != 1:
                print(f"[piro] run {run_id} was already terminal; skipping model publication")
                return

            resolved_name = (
                model_name.strip() if model_name and model_name.strip() else f"model-{run_id[:8]}"
            )
            cur.execute(
                """
                INSERT INTO model (id, "userId", name, "parameterCount", "weightsR2Key",
                                   "createdAt")
                VALUES (%s, %s, %s, %s, %s, NOW())
                """,
                (
                    model_id,
                    user_id,
                    resolved_name,
                    model.parameter_count(),
                    r2_prefix,
                ),
            )
            cur.execute(
                """
                INSERT INTO model_training_run (id, "modelId", "trainingRunId")
                VALUES (%s, %s, %s)
                """,
                (str(_uuid.uuid4()), model_id, run_id),
            )
            conn.commit()
            _set_diagnostics("complete", step=max_steps)
            _record_event("complete", step=max_steps, modelId=model_id)
            print(
                f"[piro] run {run_id} complete — model_id={model_id} "
                f"name={resolved_name!r} weights_bytes={len(pt_bytes)}",
                flush=True,
            )

        except BaseException as exc:
            completed_at = datetime.now(UTC)
            runtime_ms = max(
                0,
                int((min(completed_at, timeout_at) - started_at).total_seconds() * 1000),
            )
            _set_diagnostics(
                "failed",
                errorType=type(exc).__name__,
                errorMessage=str(exc)[:2000],
            )
            _record_event(
                "worker_failed",
                exceptionType=type(exc).__name__,
                message=str(exc)[:2000],
                traceback=traceback.format_exc(limit=50)[-12000:],
            )
            failure_details = json.dumps(
                {
                    "kind": "worker_exception",
                    "exceptionType": type(exc).__name__,
                    "message": str(exc)[:2000],
                    "traceback": traceback.format_exc(limit=50)[-12000:],
                    "phase": diagnostics_state.get("phase"),
                    "step": diagnostics_state.get("step"),
                    "observedAt": completed_at.isoformat(),
                },
                separators=(",", ":"),
            )
            cur.execute(
                """
                UPDATE training_run
                SET status = %s, error = %s, "completedAt" = %s,
                    "heartbeatAt" = %s, "workerDiagnosticsJson" = %s,
                    "failureDetailsJson" = %s, "runtimeMs" = %s,
                    "costUsd" = %s, "costBasis" = %s
                WHERE id = %s AND status = 'running'
                """,
                (
                    "error",
                    str(exc)[:2000],
                    completed_at,
                    completed_at,
                    _diagnostics_json(),
                    failure_details,
                    runtime_ms,
                    _estimate_cost_usd(runtime_ms),
                    "modal_standard_estimate",
                    run_id,
                ),
            )
            conn.commit()
            raise

        finally:
            _stop_training_watchdog(record_event=False)
            _stop_checkpoint_watchdog(record_event=False)
            _stop_heartbeat()
            cur.close()
            conn.close()


def _trainer_for(debug: bool):
    """Use a separate Modal container pool when native debug env vars are needed."""
    return (
        Trainer.with_options(env=DEBUG_ENV, secrets=[piro_secrets]) if debug else Trainer
    )


@app.function(image=trigger_image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def trigger(body: dict) -> dict:
    """Validate a generic architecture/source training request and spawn it."""
    import os

    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")

    run_id = body.get("runId")
    if not run_id:
        raise HTTPException(status_code=400, detail="runId required")

    architecture_path = str(body.get("architecturePath", "")).strip()
    source_path = str(body.get("sourcePath", "")).strip()
    dataset_prefix = str(body.get("datasetR2Prefix", "")).strip()
    if not architecture_path or not source_path or not dataset_prefix:
        raise HTTPException(
            status_code=400,
            detail="architecturePath, sourcePath, and datasetR2Prefix required",
        )

    max_steps = int(body.get("maxSteps", 5000))
    if max_steps < 1 or max_steps > 1_000_000:
        raise HTTPException(status_code=400, detail="maxSteps must be between 1 and 1,000,000")
    debug = body.get("debug", False)
    if not isinstance(debug, bool):
        raise HTTPException(status_code=400, detail="debug must be a boolean")

    function_call = _trainer_for(debug)().run.spawn(
        run_id=run_id,
        model_name=body.get("modelName"),
        architecture_path=architecture_path,
        source_path=source_path,
        dataset_r2_prefix=dataset_prefix,
        max_steps=max_steps,
        seed=int(body.get("seed", 42)),
        resume=bool(body.get("resume", False)),
        debug=debug,
    )
    return {
        "ok": True,
        "runId": run_id,
        "functionCallId": function_call.object_id,
    }
