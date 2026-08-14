"""Generic Modal training orchestration for Piro architectures and sources."""

from __future__ import annotations

from datetime import UTC

import modal
from _common import (
    CHECKPOINT_INTERVAL_STEPS,
    CHECKPOINT_SAFETY_SECONDS,
    CPU_RATE_USD_PER_CORE_SECOND,
    EVAL_INTERVAL_STEPS,
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
    ) -> None:
        import io
        import json
        import os
        import random
        import socket
        import threading
        import traceback
        import uuid as _uuid
        from datetime import datetime, timedelta

        import psycopg2
        from platform_serialization import round_nested_numbers
        from platform_training_state import heartbeat_loop, persist_worker_event

        torch = self._torch
        device = None
        print(f"[piro] run {run_id} entered worker method", flush=True)

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
            "resumeAttempts": 0,
            "maxSteps": max_steps,
            "phase": "starting",
            "step": 0,
            "checkpointStep": 0,
            "checkpointKey": None,
            "updatedAt": now.isoformat(),
        }

        def _diagnostics_json() -> str:
            with diagnostics_lock:
                return json.dumps(diagnostics_state, separators=(",", ":"))

        def _set_diagnostics(phase: str, **updates: object) -> None:
            with diagnostics_lock:
                diagnostics_state.update(updates)
                diagnostics_state["phase"] = phase
                diagnostics_state["updatedAt"] = datetime.now(UTC).isoformat()

        def _persist_event(event: str, **details: object) -> None:
            payload = {
                "event": event,
                "observedAt": datetime.now(UTC).isoformat(),
                "phase": diagnostics_state.get("phase"),
                "step": diagnostics_state.get("step"),
                **details,
            }
            try:
                persisted = persist_worker_event(
                    psycopg2.connect,
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

        _persist_event("worker_method_entered")
        conn = None
        cur = None
        try:
            _persist_event("database_connecting")
            conn = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = conn.cursor()
            _persist_event("database_connected")
            cur.execute(
                'SELECT "userId", "checkpointR2Key", "checkpointStep", "startedAt", "timeoutAt", '
                '"resumeAttempts", "configJson" FROM training_run WHERE id = %s',
                (run_id,),
            )
            row = cur.fetchone()
            _persist_event("run_metadata_loaded", found=row is not None)
        except BaseException as exc:
            _persist_event(
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
            _persist_event(
                "device_probe_complete",
                cudaAvailable=device.type == "cuda",
                device=str(device),
                gpuType=TRAINING_GPU,
            )
            if device.type != "cuda":
                raise RuntimeError("Modal training requires CUDA; no GPU was attached")
            print(f"[piro] run {run_id} using device={device} gpu={TRAINING_GPU}", flush=True)
        except BaseException as exc:
            _persist_event(
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
                'UPDATE training_run SET "heartbeatAt" = %s, "workerDiagnosticsJson" = %s, '
                '"failureDetailsJson" = NULL WHERE id = %s AND status = %s',
                (now, initial_diagnostics, run_id, "running"),
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
            _persist_event("run_not_claimable")
            conn.rollback()
            cur.close()
            conn.close()
            print(f"[piro] run {run_id} was not claimable; skipping worker")
            return
        conn.commit()
        _persist_event("run_claimed")

        heartbeat_stop = threading.Event()
        lease_lost = threading.Event()
        heartbeat_thread = threading.Thread(
            target=heartbeat_loop,
            kwargs={
                "stop_event": heartbeat_stop,
                "lease_lost_event": lease_lost,
                "connect": psycopg2.connect,
                "database_url": os.environ["DATABASE_URL"],
                "run_id": run_id,
                "interval_seconds": HEARTBEAT_INTERVAL_SECONDS,
                "diagnostics": _diagnostics_json,
            },
            name=f"piro-heartbeat-{run_id[:8]}",
            daemon=True,
        )
        heartbeat_thread.start()
        _persist_event("heartbeat_thread_started")

        def _stop_heartbeat() -> None:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=5)

        def _ensure_lease() -> None:
            if lease_lost.is_set():
                raise RuntimeError("training run lease was lost while the worker was running")

        model = None
        optimizer = None
        try:
            _set_diagnostics("loading_data")
            _persist_event("loading_data_entered")
            random.seed(seed)
            torch.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)
            architecture_class = self._load_architecture(architecture_path)
            _persist_event("architecture_loader_ready")
            r2 = _r2_client(os)
            _persist_event("storage_client_ready")
            train_data = self._load_source_examples(
                source_path=source_path,
                r2_client=r2,
                bucket=R2_BUCKET,
                prefix=dataset_r2_prefix,
                split="train",
                limit=500,
            )
            val_data = self._load_source_examples(
                source_path=source_path,
                r2_client=r2,
                bucket=R2_BUCKET,
                prefix=dataset_r2_prefix,
                split="eval",
                limit=100,
            )
            if not train_data:
                raise ValueError("training dataset is empty")
            _persist_event("dataset_loaded", trainExamples=len(train_data), evalExamples=len(val_data))

            checkpoint_payload: dict | None = None
            if checkpoint_key:
                _set_diagnostics("loading_checkpoint", checkpointStep=checkpoint_step, checkpointKey=checkpoint_key)
                response = r2.get_object(Bucket=R2_BUCKET, Key=checkpoint_key)
                checkpoint_payload = torch.load(
                    io.BytesIO(response["Body"].read()),
                    map_location=device,
                    weights_only=False,
                )
                _persist_event("checkpoint_payload_loaded", checkpointStep=checkpoint_step)
                checkpoint_envelope = checkpoint_payload.get("config", {})
                for key, expected in {
                    "architecturePath": architecture_path,
                    "sourcePath": source_path,
                    "datasetR2Prefix": dataset_r2_prefix,
                }.items():
                    if checkpoint_envelope.get(key) != expected:
                        raise RuntimeError(f"checkpoint {key} does not match this run")

            _set_diagnostics("building_model", trainExamples=len(train_data), evalExamples=len(val_data))
            _persist_event("model_build_started")
            model_config = dict(persisted_config or {}) if resume else {}
            if not model_config:
                model_config = dict((checkpoint_payload or {}).get("config", {}).get("modelConfig", {}))
            if checkpoint_key and not model_config:
                raise RuntimeError("resume checkpoint is missing the persisted model configuration")
            if not model_config:
                model_config = architecture_class.config_for_training(train_data)
            model = architecture_class.from_config(model_config).to(device)
            _persist_event("model_built")
            optimizer = torch.optim.Adam(model.parameters(), **model.optimizer_kwargs())
            _persist_event("optimizer_built")

            config_dict = {
                **model.config_dict(),
                "architecturePath": architecture_path,
                "sourcePath": source_path,
                "datasetR2Prefix": dataset_r2_prefix,
                "maxSteps": max_steps,
                "checkpointIntervalSteps": CHECKPOINT_INTERVAL_STEPS,
                "evalIntervalSteps": EVAL_INTERVAL_STEPS,
            }
            cur.execute(
                'UPDATE training_run SET "configJson" = %s WHERE id = %s',
                (json.dumps(config_dict), run_id),
            )
            conn.commit()

            history: list[dict] = []
            order = list(range(len(train_data)))
            cursor = 0
            start_step = 0

            def _restore_optimizer_device() -> None:
                for state in optimizer.state.values():
                    for key, value in state.items():
                        if hasattr(value, "to"):
                            state[key] = value.to(device)

            def _load_checkpoint() -> None:
                nonlocal history, order, cursor, start_step
                if not checkpoint_key:
                    _set_diagnostics("checkpoint_ready", checkpointStep=0)
                    return
                payload = checkpoint_payload
                if payload is None:
                    _set_diagnostics("loading_checkpoint", checkpointStep=checkpoint_step, checkpointKey=checkpoint_key)
                    response = r2.get_object(Bucket=R2_BUCKET, Key=checkpoint_key)
                    payload = torch.load(
                        io.BytesIO(response["Body"].read()),
                        map_location=device,
                        weights_only=False,
                    )
                checkpoint_config = payload.get("config", {})
                for key, expected in {
                    "architecturePath": architecture_path,
                    "sourcePath": source_path,
                    "datasetR2Prefix": dataset_r2_prefix,
                }.items():
                    if checkpoint_config.get(key) != expected:
                        raise RuntimeError(f"checkpoint {key} does not match this run")
                model.load_model_state(payload["model"])
                optimizer.load_state_dict(payload["optimizer"])
                _persist_event("checkpoint_restored", checkpointStep=checkpoint_step)
                model.load_checkpoint_state(payload.get("runtime", {}))
                _restore_optimizer_device()
                history = list(payload.get("history", []))
                order = list(payload.get("order", order))
                cursor = int(payload.get("cursor", 0))
                start_step = int(payload.get("step", checkpoint_step))
                if len(order) != len(train_data):
                    raise RuntimeError("checkpoint dataset ordering does not match current data")
                random.setstate(payload["pythonRandomState"])
                torch.set_rng_state(payload["torchRandomState"].cpu())
                if device.type == "cuda" and payload.get("cudaRandomState") is not None:
                    torch.cuda.set_rng_state_all(payload["cudaRandomState"])
                _set_diagnostics(
                    "checkpoint_ready",
                    step=start_step,
                    checkpointStep=start_step,
                    checkpointKey=checkpoint_key,
                )
                print(f"[piro] resumed run {run_id} from checkpoint step {start_step}")

            def _save_checkpoint(step: int) -> None:
                _set_diagnostics("checkpointing", step=step)
                if device.type == "cuda":
                    torch.cuda.synchronize(device)
                payload = {
                    "version": 2,
                    "step": step,
                    "model": model.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "runtime": model.checkpoint_state(),
                    "history": history,
                    "order": order,
                    "cursor": cursor,
                    "pythonRandomState": random.getstate(),
                    "torchRandomState": torch.get_rng_state(),
                    "cudaRandomState": (
                        torch.cuda.get_rng_state_all() if device.type == "cuda" else None
                    ),
                    "config": {
                        "maxSteps": max_steps,
                        "seed": seed,
                        "architecturePath": architecture_path,
                        "sourcePath": source_path,
                        "datasetR2Prefix": dataset_r2_prefix,
                        "modelConfig": model.config_dict(),
                    },
                }
                buffer = io.BytesIO()
                torch.save(payload, buffer)
                key = f"checkpoints/{run_id}/step-{step}.pt"
                r2.put_object(
                    Bucket=R2_BUCKET,
                    Key=key,
                    Body=buffer.getvalue(),
                    ContentType="application/octet-stream",
                )
                checkpointed_at = datetime.now(UTC)
                cur.execute(
                    """
                    UPDATE training_run
                    SET "stepHistoryJson" = %s,
                        "checkpointR2Key" = %s,
                        "checkpointStep" = %s,
                        "checkpointAt" = %s,
                        "heartbeatAt" = %s
                    WHERE id = %s AND status = 'running'
                    """,
                    (
                        json.dumps(history),
                        key,
                        step,
                        checkpointed_at,
                        checkpointed_at,
                        run_id,
                    ),
                )
                if cur.rowcount != 1:
                    conn.rollback()
                    raise RuntimeError("training run became terminal while checkpointing")
                conn.commit()
                _set_diagnostics(
                    "training",
                    step=step,
                    checkpointStep=step,
                    checkpointKey=key,
                )

            def _next_batch() -> list:
                nonlocal cursor
                if cursor == 0:
                    random.shuffle(order)
                size = min(model.training_batch_size, len(order))
                indices = [order[(cursor + offset) % len(order)] for offset in range(size)]
                cursor = (cursor + size) % len(order)
                return [train_data[index] for index in indices]

            _load_checkpoint()
            if not checkpoint_key and start_step == 0:
                _save_checkpoint(0)
                print(f"[piro] run {run_id} initialized checkpoint at step 0")

            for step in range(start_step + 1, max_steps + 1):
                _set_diagnostics("training", step=step)
                if step == checkpoint_step + 1:
                    _persist_event("training_entered", step=step)
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
                        Trainer().run.spawn(
                            run_id=run_id,
                            model_name=model_name,
                            architecture_path=architecture_path,
                            source_path=source_path,
                            dataset_r2_prefix=dataset_r2_prefix,
                            max_steps=max_steps,
                            seed=seed,
                            resume=True,
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

                _set_diagnostics("optimizer_step", step=step)
                train_loss = model.train_step(_next_batch(), optimizer)
                _ensure_lease()
                should_evaluate = step % EVAL_INTERVAL_STEPS == 0 or step == max_steps
                if should_evaluate:
                    _set_diagnostics("evaluation", step=step)
                    evaluation = model.evaluate(val_data)
                    history.append(
                        {
                            "step": step,
                            "trainLoss": train_loss,
                            "valLoss": evaluation.loss,
                            "valAccuracy": evaluation.accuracy,
                        }
                    )
                    print(
                        f"[piro] run {run_id} step {step}/{max_steps} — "
                        f"train_loss={train_loss:.4f}  val_loss={evaluation.loss:.4f}  "
                        f"val_acc={evaluation.accuracy:.3f}"
                    )
                if step % CHECKPOINT_INTERVAL_STEPS == 0 or step == max_steps:
                    _save_checkpoint(step)

            _set_diagnostics("publishing_model", step=max_steps)
            _persist_event("publishing_started", step=max_steps)
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

            last = history[-1]
            completed_at = datetime.now(UTC)
            runtime_ms = int((completed_at - started_at).total_seconds() * 1000)
            cur.execute(
                """
                UPDATE training_run
                SET status = %s, "finalTrainLoss" = %s, "finalValLoss" = %s,
                    "finalValAccuracy" = %s, "completedAt" = %s, "heartbeatAt" = %s,
                    "runtimeMs" = %s, "costUsd" = %s, "costBasis" = %s
                WHERE id = %s AND status = 'running'
                """,
                (
                    "complete",
                    float(last["trainLoss"]),
                    float(last["valLoss"]),
                    float(last["valAccuracy"]),
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
            _persist_event("complete", step=max_steps, modelId=model_id)
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
            _persist_event(
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
            _stop_heartbeat()
            cur.close()
            conn.close()


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

    Trainer().run.spawn(
        run_id=run_id,
        model_name=body.get("modelName"),
        architecture_path=architecture_path,
        source_path=source_path,
        dataset_r2_prefix=dataset_prefix,
        max_steps=max_steps,
        seed=int(body.get("seed", 42)),
        resume=bool(body.get("resume", False)),
    )
    return {"ok": True, "runId": run_id}
