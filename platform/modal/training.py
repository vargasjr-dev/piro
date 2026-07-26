"""Piro Modal training job and HTTP trigger."""

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
    INFER_ENDPOINT,
    LIVE_PROGRESS_INTERVAL_SECONDS,
    MEMORY_RATE_USD_PER_GIB_SECOND,
    R2_BUCKET,
    TRAINING_CPU,
    TRAINING_DEADLINE_SECONDS,
    TRAINING_GPU,
    TRAINING_MEMORY_MB,
    TRAINING_TIMEOUT_SECONDS,
    _r2_client,
    app,
    image,
    piro_secrets,
)


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
        """Runs once per container — imports are snapshotted, not re-run on warm reuse."""
        import torch  # noqa: F401 — imported here so warm containers skip re-import

        from architectures._common.encoding import memory_embedding, policy_embedding
        from architectures._common.trainer import Trainer as _Trainer
        from architectures._common.trainer import TrainerConfig
        from architectures.ashfall.ctm import ContinuousThoughtModel, CTMConfig
        from sources._common.sequences import generate_sorting_dataset

        # Expose to run()
        self._torch = torch
        self._generate_sorting_dataset = generate_sorting_dataset
        self._Trainer = _Trainer
        self._TrainerConfig = TrainerConfig
        self._ContinuousThoughtModel = ContinuousThoughtModel
        self._CTMConfig = CTMConfig
        self._memory_embedding = memory_embedding
        self._policy_embedding = policy_embedding

        # Configs
        self._ctm_cfg = CTMConfig(
            n_neurons=4,
            embed_dim=8,
            query_dim=8,
            value_dim=8,
            hidden_dim=16,
            n_classes=5,
        )
        self._memory_ctm_cfg = CTMConfig(
            n_neurons=4,
            embed_dim=8,
            query_dim=8,
            value_dim=8,
            hidden_dim=16,
            n_classes=32,
        )
        # Approximately 10× the associative-recall CTM parameter count:
        # 2,005 parameters at baseline versus 20,047 here (9.9985×).
        self._memory_ctm_10x_cfg = CTMConfig(
            n_neurons=6,
            embed_dim=16,
            query_dim=16,
            value_dim=16,
            hidden_dim=88,
            n_classes=32,
        )

        print("[piro] container ready — torch + model code loaded")

    @modal.method()
    def run(
        self,
        run_id: str,
        model_name: str | None,
        model_template: str,
        data_source: str,
        dataset_r2_prefix: str,
        max_steps: int,
        seed: int,
        resume: bool = False,
    ) -> None:
        import io
        import json
        import os
        import random
        import threading
        import time
        import uuid as _uuid
        from datetime import datetime, timedelta

        import psycopg2
        from platform_progress import update_progress
        from platform_serialization import round_nested_numbers

        torch = self._torch
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        if device.type != "cuda":
            raise RuntimeError("Modal training requires CUDA; no GPU was attached")
        print(f"[piro] run {run_id} using device={device} gpu={TRAINING_GPU}")

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

        def _build_dataset(n: int, split: str) -> list:
            if data_source == "sorting-sequences" and dataset_r2_prefix.rstrip("/").endswith(
                "/sorting-sequences"
            ):
                seqs = self._generate_sorting_dataset(
                    n=n, length=self._ctm_cfg.n_neurons, seed=seed, split=split
                )
                samples = []
                for seq in seqs:
                    numbers = list(seq.sequence)
                    emb = torch.zeros(
                        self._ctm_cfg.n_neurons, self._ctm_cfg.embed_dim, device=device
                    )
                    for i, val in enumerate(numbers):
                        idx = min(val, self._ctm_cfg.embed_dim - 1)
                        emb[i, idx] = 1.0
                    label = numbers.index(min(numbers))
                    samples.append((emb, label))
                return samples

            if data_source not in {"associative-recall", "owner-policy-worlds"}:
                raise ValueError(
                    "the Modal trainer supports sorting-sequences, associative-recall, "
                    "and owner-policy-worlds datasets"
                )

            r2 = _r2_client(os)
            key = f"{dataset_r2_prefix.rstrip('/')}/train.jsonl"
            response = r2.get_object(Bucket=R2_BUCKET, Key=key)
            records = [
                json.loads(line)
                for line in response["Body"].read().decode("utf-8").splitlines()
                if line.strip()
            ]
            if data_source == "owner-policy-worlds":
                episodes = []
                for record in records:
                    inputs = record.get("inputs")
                    target = record.get("answerIndex")
                    if not isinstance(inputs, list) or len(inputs) < 2:
                        raise ValueError(
                            "owner-policy-worlds records need history and query inputs"
                        )
                    if not isinstance(target, int) or not 0 <= target < 4:
                        raise ValueError("owner-policy-worlds answerIndex must be in [0, 4)")
                    texts = [item["parts"][0]["text"] for item in inputs]
                    episodes.append((tuple(texts[:-1]), texts[-1], target))
                if not episodes:
                    raise ValueError("owner-policy-worlds dataset is empty")
                marked = [
                    episode
                    for record, episode in zip(records, episodes, strict=True)
                    if record.get("metadata", {}).get("split")
                    == ("train" if split == "train" else "eval")
                ]
                if marked:
                    return marked
                split_at = max(1, int(len(episodes) * 0.8))
                return (
                    episodes[:split_at] if split == "train" else episodes[split_at:] or episodes[:1]
                )

            episodes = []
            for record in records:
                inputs = record.get("inputs")
                if not isinstance(inputs, list) or len(inputs) < 2:
                    raise ValueError("associative-recall records must contain at least two inputs")
                texts = [item["parts"][0]["text"] for item in inputs]
                query = texts[-1]
                observations = texts[:-1]
                target = next(
                    (
                        line
                        for observation in observations
                        for line in observation.splitlines()
                        if line.startswith(f"{query} = ")
                    ),
                    None,
                )
                if target is None:
                    raise ValueError(f"no write found for query {query!r}")
                value = target.split("=", maxsplit=1)[1].strip()
                episodes.append((tuple(observations), query, value))
            if not episodes:
                raise ValueError("associative-recall dataset is empty")
            split_at = max(1, int(len(episodes) * 0.8))
            if split == "train":
                return episodes[:split_at]
            return episodes[split_at:] or episodes[:1]

        # ── DB ────────────────────────────────────────────────────────────────
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()

        # Load the run lease and latest checkpoint metadata.
        cur.execute(
            'SELECT "userId", "checkpointR2Key", "checkpointStep", "stepHistoryJson", "startedAt", "timeoutAt" FROM training_run WHERE id = %s',
            (run_id,),
        )
        row = cur.fetchone()
        user_id: str = row[0] if row else ""
        checkpoint_key: str | None = row[1] if row else None
        checkpoint_step: int = int(row[2] or 0) if row else 0
        persisted_started_at = row[4] if row else None
        # The first invocation claims queued→running. Resumed invocations keep
        # the same absolute deadline for the logical run; checkpointing must not
        # silently buy another application window.
        now = datetime.now(UTC)
        started_at = persisted_started_at or now
        timeout_at = (
            row[5]
            if resume and row and row[5]
            else started_at + timedelta(seconds=TRAINING_DEADLINE_SECONDS)
        )
        if resume:
            cur.execute(
                'UPDATE training_run SET "heartbeatAt" = %s WHERE id = %s AND status = %s',
                (now, run_id, "running"),
            )
        else:
            cur.execute(
                'UPDATE training_run SET status = %s, "startedAt" = %s, "heartbeatAt" = %s, "timeoutAt" = %s, "resourceType" = %s, "gpuType" = %s, "cpuCores" = %s, "memoryMb" = %s WHERE id = %s AND status = %s',
                (
                    "running",
                    started_at,
                    now,
                    timeout_at,
                    "gpu",
                    TRAINING_GPU,
                    TRAINING_CPU,
                    TRAINING_MEMORY_MB,
                    run_id,
                    "queued",
                ),
            )
        if cur.rowcount != 1:
            conn.rollback()
            cur.close()
            conn.close()
            print(f"[piro] run {run_id} was not claimable; skipping worker")
            return
        conn.commit()

        from platform_training_state import heartbeat_loop

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
            },
            name=f"piro-heartbeat-{run_id[:8]}",
            daemon=True,
        )
        heartbeat_thread.start()

        def _stop_heartbeat() -> None:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=5)

        def _ensure_lease() -> None:
            if lease_lost.is_set():
                raise RuntimeError("training run lease was lost while the worker was running")

        last_progress_publish_at = 0.0

        def _publish_progress(progress: dict, *, force: bool = False) -> None:
            nonlocal last_progress_publish_at
            now_monotonic = time.monotonic()
            if (
                not force
                and now_monotonic - last_progress_publish_at < LIVE_PROGRESS_INTERVAL_SECONDS
            ):
                return
            try:
                if not update_progress(
                    psycopg2.connect,
                    os.environ["DATABASE_URL"],
                    run_id,
                    progress,
                ):
                    lease_lost.set()
                    raise RuntimeError("training run lease was lost while publishing progress")
                last_progress_publish_at = now_monotonic
            except RuntimeError:
                raise
            except Exception as exc:  # noqa: BLE001 - progress is observability, not training state
                print(f"[piro] run {run_id} progress update failed: {exc}")

        try:
            # ── Build model ───────────────────────────────────────────────────
            random.seed(seed)
            torch.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)

            if data_source in {
                "associative-recall",
                "owner-policy-worlds",
            } and model_template not in {"ctm", "ctm-10x"}:
                raise ValueError(f"{data_source} training requires the stateful ctm architecture")

            if model_template in {"ctm", "ctm-10x"}:
                if data_source in {"associative-recall", "owner-policy-worlds"}:
                    cfg = (
                        self._memory_ctm_10x_cfg
                        if model_template == "ctm-10x"
                        else self._memory_ctm_cfg
                    )
                else:
                    cfg = self._ctm_cfg
                model = self._ContinuousThoughtModel(cfg).to(device)
                # CTM working state is intentionally not registered as PyTorch
                # buffers, so rebuild it after moving parameters to CUDA.
                model.reset()
                persisted_template = model_template
                config_dict = {
                    "template": persisted_template,
                    "n_neurons": cfg.n_neurons,
                    "embed_dim": cfg.embed_dim,
                    "query_dim": cfg.query_dim,
                    "value_dim": cfg.value_dim,
                    "hidden_dim": cfg.hidden_dim,
                    "n_classes": cfg.n_classes,
                }
            else:
                raise ValueError(f"Unknown model_template: {model_template!r}")

            # Persist architecture and training-budget config immediately.
            config_dict["dataSource"] = data_source
            config_dict["maxSteps"] = max_steps
            config_dict["checkpointIntervalSteps"] = CHECKPOINT_INTERVAL_STEPS
            config_dict["evalIntervalSteps"] = EVAL_INTERVAL_STEPS
            config_json = json.dumps(config_dict)
            cur.execute(
                'UPDATE training_run SET "configJson" = %s WHERE id = %s',
                (config_json, run_id),
            )
            conn.commit()

            # ── Build dataset ─────────────────────────────────────────────────
            # Keep the split deterministic across resumed invocations.
            train_data = _build_dataset(500, "train")
            val_data = _build_dataset(100, "val")

            trainer_cfg = self._TrainerConfig(
                max_steps=max_steps,
                seed=seed,
                eval_interval=EVAL_INTERVAL_STEPS,
            )
            trainer = self._Trainer(model, trainer_cfg)
            history: list[dict] = []
            order = list(range(len(train_data)))
            cursor = 0
            start_step = 0
            r2 = _r2_client(os)

            def _memory_prediction(
                episode: tuple[tuple[str, ...], str, str | int],
                *,
                train_mode: bool,
            ):
                import torch.nn.functional as F

                observations, query, value = episode
                model.reset()
                embed = (
                    self._policy_embedding
                    if data_source == "owner-policy-worlds"
                    else self._memory_embedding
                )
                for packet in observations:
                    for observation in packet.splitlines():
                        if not observation.strip():
                            continue
                        model(
                            embed(
                                observation,
                                cfg.embed_dim,
                                torch_module=torch,
                                dtype=next(model.parameters()).dtype,
                                device=next(model.parameters()).device,
                            ),
                            preserve_graph=train_mode,
                        )
                output = model(
                    embed(
                        query if data_source == "owner-policy-worlds" else f"QUERY:{query}",
                        cfg.embed_dim,
                        torch_module=torch,
                        dtype=next(model.parameters()).dtype,
                        device=next(model.parameters()).device,
                    ),
                    preserve_graph=train_mode,
                )
                logits = output.logits if hasattr(output, "logits") else output
                target = int(
                    value
                    if data_source == "owner-policy-worlds"
                    else str(value).removeprefix("value_")
                )
                loss = F.cross_entropy(
                    logits.unsqueeze(0),
                    torch.tensor([target], device=logits.device),
                )
                return logits, target, loss

            def _restore_optimizer_device() -> None:
                for state in trainer.optimizer.state.values():
                    for key, value in state.items():
                        if hasattr(value, "to"):
                            state[key] = value.to(device)

            def _load_checkpoint() -> None:
                nonlocal history, order, cursor, start_step
                if not checkpoint_key:
                    return
                response = r2.get_object(Bucket=R2_BUCKET, Key=checkpoint_key)
                payload = torch.load(
                    io.BytesIO(response["Body"].read()),
                    map_location=device,
                    weights_only=False,
                )
                checkpoint_config = payload.get("config", {})
                if checkpoint_config.get("datasetR2Prefix") != dataset_r2_prefix:
                    raise RuntimeError("checkpoint dataset does not match this run")
                if checkpoint_config.get("modelTemplate") != model_template:
                    raise RuntimeError("checkpoint architecture does not match this run")
                model.load_state_dict(payload["model"])
                trainer.optimizer.load_state_dict(payload["optimizer"])
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
                print(f"[piro] resumed run {run_id} from checkpoint step {start_step}")

            last_checkpoint_step = checkpoint_step

            def _save_checkpoint(step: int) -> None:
                nonlocal last_checkpoint_step
                if device.type == "cuda":
                    torch.cuda.synchronize(device)
                payload = {
                    "version": 1,
                    "step": step,
                    "model": model.state_dict(),
                    "optimizer": trainer.optimizer.state_dict(),
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
                        "datasetR2Prefix": dataset_r2_prefix,
                        "modelTemplate": model_template,
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
                    SET "currentStep" = %s,
                        "stepHistoryJson" = %s,
                        "checkpointR2Key" = %s,
                        "checkpointStep" = %s,
                        "checkpointAt" = %s,
                        "heartbeatAt" = %s
                    WHERE id = %s AND status = 'running'
                    """,
                    (
                        step,
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
                last_checkpoint_step = step

            def _next_batch() -> list:
                nonlocal cursor
                if not train_data:
                    raise ValueError("training dataset is empty")
                if cursor == 0:
                    random.shuffle(order)
                size = min(trainer_cfg.batch_size, len(order))
                indices = [order[(cursor + offset) % len(order)] for offset in range(size)]
                cursor = (cursor + size) % len(order)
                return [train_data[index] for index in indices]

            def _memory_step(batch: list, *, step: int) -> float:
                model.train()
                trainer.optimizer.zero_grad()
                losses = []
                for episode_index, episode in enumerate(batch, start=1):
                    _, _, loss = _memory_prediction(episode, train_mode=True)
                    losses.append(loss)
                    model.reset()
                    _publish_progress(
                        {
                            "phase": "train",
                            "optimizerStep": step,
                            "maxSteps": max_steps,
                            "episodeIndex": episode_index,
                            "episodeCount": len(batch),
                            "unit": "episodes",
                            "checkpointStep": last_checkpoint_step,
                        }
                    )
                loss = torch.stack(losses).mean()
                loss.backward()
                trainer.optimizer.step()
                _publish_progress(
                    {
                        "phase": "train",
                        "optimizerStep": step,
                        "maxSteps": max_steps,
                        "episodeIndex": len(batch),
                        "episodeCount": len(batch),
                        "unit": "episodes",
                        "stepCompleted": True,
                        "checkpointStep": last_checkpoint_step,
                    },
                    force=True,
                )
                return float(loss.detach())

            def _memory_evaluate(data: list, *, step: int) -> tuple[float, float]:
                total_loss = 0.0
                correct = 0
                model.eval()
                for episode_index, episode in enumerate(data, start=1):
                    with torch.no_grad():
                        logits, target, loss = _memory_prediction(episode, train_mode=False)
                    total_loss += float(loss.detach())
                    correct += int(int(logits.argmax().item()) == target)
                    model.reset()
                    _publish_progress(
                        {
                            "phase": "validation",
                            "optimizerStep": step,
                            "maxSteps": max_steps,
                            "episodeIndex": episode_index,
                            "episodeCount": len(data),
                            "unit": "episodes",
                            "checkpointStep": last_checkpoint_step,
                        }
                    )
                count = max(1, len(data))
                _publish_progress(
                    {
                        "phase": "validation",
                        "optimizerStep": step,
                        "maxSteps": max_steps,
                        "episodeIndex": len(data),
                        "episodeCount": len(data),
                        "unit": "episodes",
                        "phaseCompleted": True,
                        "checkpointStep": last_checkpoint_step,
                    },
                    force=True,
                )
                return total_loss / count, correct / count

            _load_checkpoint()
            if not checkpoint_key and start_step == 0:
                _save_checkpoint(0)
                _publish_progress(
                    {
                        "phase": "train",
                        "optimizerStep": 0,
                        "maxSteps": max_steps,
                        "episodeIndex": 0,
                        "episodeCount": trainer_cfg.batch_size,
                        "unit": "episodes",
                        "checkpointStep": 0,
                    },
                    force=True,
                )
                print(f"[piro] run {run_id} initialized checkpoint at step 0")

            for step in range(start_step + 1, max_steps + 1):
                now = datetime.now(UTC)
                if now + timedelta(seconds=CHECKPOINT_SAFETY_SECONDS) >= timeout_at:
                    _save_checkpoint(step - 1)
                    completed_at = datetime.now(UTC)
                    runtime_ms = max(
                        0,
                        int((min(completed_at, timeout_at) - started_at).total_seconds() * 1000),
                    )
                    cur.execute(
                        """
                        UPDATE training_run
                        SET status = %s, error = %s, "completedAt" = %s,
                            "runtimeMs" = %s, "costUsd" = %s,
                            "costBasis" = %s
                        WHERE id = %s AND status = 'running'
                        """,
                        (
                            "error",
                            f"Training deadline reached; checkpoint saved at step {step - 1}.",
                            completed_at,
                            runtime_ms,
                            _estimate_cost_usd(runtime_ms),
                            "modal_standard_estimate",
                            run_id,
                        ),
                    )
                    conn.commit()
                    print(f"[piro] run {run_id} checkpointed at step {step - 1}; deadline reached")
                    return

                batch = _next_batch()
                if data_source in {"associative-recall", "owner-policy-worlds"}:
                    train_loss = _memory_step(batch, step=step)
                else:
                    train_loss = trainer._train_step(batch)
                _ensure_lease()

                should_evaluate = step % EVAL_INTERVAL_STEPS == 0 or step == max_steps
                if should_evaluate:
                    if data_source in {"associative-recall", "owner-policy-worlds"}:
                        val_loss, val_acc = _memory_evaluate(val_data, step=step)
                    else:
                        val_loss, val_acc = trainer._evaluate(val_data)
                    history.append(
                        {
                            "step": step,
                            "trainLoss": train_loss,
                            "valLoss": val_loss,
                            "valAccuracy": val_acc,
                        }
                    )
                    print(
                        f"[piro] run {run_id} step {step}/{max_steps} — "
                        f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f}  "
                        f"val_acc={val_acc:.3f}"
                    )
                if step % CHECKPOINT_INTERVAL_STEPS == 0 or step == max_steps:
                    _save_checkpoint(step)

            # ── Serialize + upload model weights to R2
            # Allocate the model ID before deriving its R2 prefix.
            model_id = str(_uuid.uuid4())
            state = {key: value.detach().cpu() for key, value in model.state_dict().items()}

            # Binary .pt file for inference
            pt_buf = io.BytesIO()
            torch.save(state, pt_buf)
            pt_bytes = pt_buf.getvalue()

            # JSON file for visualization: {key: [[...], ...] or [...]}
            weights_json_str = json.dumps(
                {k: round_nested_numbers(v.tolist()) for k, v in state.items()}
            )

            r2_prefix = f"models/{model_id}"
            r2 = _r2_client(os)
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
            print(
                f"[piro] uploaded weights to R2: {r2_prefix}/ ({len(pt_bytes)} bytes .pt, {len(weights_json_str)} bytes .json)"
            )

            # ── Final training_run update ─────────────────────────────────────
            last = history[-1]
            completed_at = datetime.now(UTC)
            runtime_ms = int((completed_at - started_at).total_seconds() * 1000)
            cur.execute(
                """
                UPDATE training_run
                SET
                    status             = %s,
                    "finalTrainLoss"   = %s,
                    "finalValLoss"     = %s,
                    "finalValAccuracy" = %s,
                    "completedAt"      = %s,
                    "heartbeatAt"      = %s,
                    "runtimeMs"        = %s,
                    "costUsd"          = %s,
                    "costBasis"        = %s
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
                print(
                    f"[piro] run {run_id} was already terminal when worker completed; "
                    "skipping model publication"
                )
                return

            # ── Create model + model_training_run rows (with weights) ─────────
            param_count = sum(p.numel() for p in model.parameters())
            resolved_name = (
                model_name.strip()
                if model_name and model_name.strip()
                else f"{model_template}-{run_id[:8]}"
            )
            cur.execute(
                """
                INSERT INTO model (id, "userId", name, "parameterCount", "weightsR2Key", "inferenceEndpoint", "createdAt")
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """,
                (model_id, user_id, resolved_name, param_count, r2_prefix, INFER_ENDPOINT),
            )
            cur.execute(
                """
                INSERT INTO model_training_run (id, "modelId", "trainingRunId")
                VALUES (%s, %s, %s)
                """,
                (str(_uuid.uuid4()), model_id, run_id),
            )
            conn.commit()
            print(
                f"[piro] run {run_id} complete — "
                f"val_acc={last['valAccuracy']:.3f}  val_loss={last['valLoss']:.4f}  "
                f"model_id={model_id}  name={resolved_name!r}  "
                f"weights_bytes={len(pt_bytes)}"
            )

        except BaseException as exc:
            completed_at = datetime.now(UTC)
            runtime_ms = max(
                0,
                int((min(completed_at, timeout_at) - started_at).total_seconds() * 1000),
            )
            cur.execute(
                """
                UPDATE training_run
                SET status = %s, error = %s, "completedAt" = %s,
                    "heartbeatAt" = %s, "runtimeMs" = %s, "costUsd" = %s,
                    "costBasis" = %s
                WHERE id = %s AND status = 'running'
                """,
                (
                    "error",
                    str(exc),
                    completed_at,
                    completed_at,
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


@app.function(image=image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def trigger(body: dict) -> dict:
    """
    Accept a training request from Vercel, spawn it async, return 200 immediately.

    Body:
        {
            "runId":         str,
            "modelName":     str | null,
            "architecturePath": str,
            "datasetR2Prefix": str,
            "maxSteps":      int,
            "seed":          int,
            "resume":        bool,
            "secret":        str,
        }
    """
    import os

    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")

    run_id = body.get("runId")
    if not run_id:
        raise HTTPException(status_code=400, detail="runId required")

    architecture_path = str(body.get("architecturePath", ""))
    dataset_prefix = str(body.get("datasetR2Prefix", ""))
    model_template = architecture_path.rstrip("/").rsplit("/", 1)[-1]
    if model_template.endswith(".py"):
        model_template = model_template[:-3]
    if model_template == "ctm_10x":
        model_template = "ctm-10x"
    model_template = model_template or "ctm"
    data_source = dataset_prefix.rstrip("/").rsplit("/", 1)[-1]
    if not architecture_path or not dataset_prefix:
        raise HTTPException(status_code=400, detail="architecturePath and datasetR2Prefix required")

    max_steps = int(body.get("maxSteps", 5000))
    if max_steps < 1 or max_steps > 1_000_000:
        raise HTTPException(status_code=400, detail="maxSteps must be between 1 and 1,000,000")

    trainer = Trainer()
    trainer.run.spawn(
        run_id=run_id,
        model_name=body.get("modelName"),
        model_template=model_template,
        data_source=data_source,
        dataset_r2_prefix=dataset_prefix,
        max_steps=max_steps,
        seed=int(body.get("seed", 42)),
        resume=bool(body.get("resume", False)),
    )

    return {"ok": True, "runId": run_id}
