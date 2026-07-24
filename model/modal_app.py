"""
model/modal_app.py

Modal app for Piro training and inference.

Deploy
------
    modal deploy model/modal_app.py

This registers three Modal endpoints:
  - Trainer (cls)  : .run() called by spawn() — heavy imports in @enter()
  - Infer   (cls)  : .generate() called by spawn() from the infer endpoint
  - trigger        : POST web endpoint called by Vercel /api/training-runs
  - infer          : POST web endpoint called by Vercel benchmark runner
  - source         : POST web endpoint called by Vercel source generation

Environment
-----------
Modal secret named "piro-secrets" must contain:
  DATABASE_URL          — Neon Postgres connection string
  MODAL_WEBHOOK_SECRET  — shared secret between Vercel and Modal

Vercel env vars needed:
  MODAL_TRAINING_ENDPOINT  — the /trigger URL printed after `modal deploy`
  MODAL_INFERENCE_ENDPOINT — the /infer URL printed after `modal deploy`
  MODAL_SOURCE_ENDPOINT    — the /source URL printed after `modal deploy`
"""

from __future__ import annotations

import modal

# fastapi is available inside Modal containers but NOT in the GHA deploy
# environment. The try/except lets modal deploy parse this file cleanly;
# at runtime get_type_hints() resolves "Request" from module globals where
# it will have been imported successfully.
try:
    from fastapi import Request
except ImportError:
    pass  # deploy-time only — Modal containers always have fastapi

app = modal.App("piro")

# Deterministic URLs — derived from Modal app name + function name.
# Format: https://<modal-username>--<app-name>-<function-name>.modal.run
# Update if the Modal username or app name ever changes.
INFER_ENDPOINT = "https://dvargasfuertes--piro-infer.modal.run"
SERIALIZE_ENDPOINT = "https://dvargasfuertes--piro-serialize.modal.run"
SERIALIZE_SOURCE_ENDPOINT = "https://dvargasfuertes--piro-serialize-source.modal.run"

# R2 bucket name — must match BUCKET() in src/lib/r2.ts
R2_BUCKET = "piro-kb"

# Keep training on an explicitly requested GPU. The 10x CTM fits comfortably
# on a T4, and the explicit declaration prevents an accidental CPU fallback.
TRAINING_GPU = "T4"
TRAINING_CPU = 1.0
TRAINING_MEMORY_MB = 4096
TRAINING_TIMEOUT_SECONDS = 3300
TRAINING_DEADLINE_SECONDS = 3000
CHECKPOINT_INTERVAL_STEPS = 250
CHECKPOINT_SAFETY_SECONDS = 120
GPU_RATE_USD_PER_SECOND = 0.000164
CPU_RATE_USD_PER_CORE_SECOND = 0.0000131
MEMORY_RATE_USD_PER_GIB_SECOND = 0.00000222


def _r2_client(os_module):
    """Build a boto3 S3 client pointed at the B2/R2 bucket."""
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

# ── Images ────────────────────────────────────────────────────────────────────

# Training + inference: needs torch, psycopg2, the model/ package, and piro/
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.3.0",
        "numpy>=1.26.0",
        "psycopg2-binary>=2.9",
        "fastapi[standard]>=0.110.0",
        "boto3>=1.34.0",
        "pydantic>=2.0",
    )
    .add_local_python_source("model")
    .add_local_python_source("piro")
)

# Serialize: lightweight — no torch (model.py imports are exec'd inside a
# subprocess-style importlib call so torch is loaded only when the user's
# model needs it, which it will — but we still need it for nn.Module base).
# Keep it the same base for simplicity.
serialize_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.3.0",
        "fastapi[standard]>=0.110.0",
        "boto3>=1.34.0",
        "pydantic>=2.0",
    )
    .add_local_python_source("piro")
)

piro_secrets = modal.Secret.from_name("piro-secrets")

# ── Manifest cache — keyed by sha256(model.py source) ────────────────────────
# Simple in-process dict: lives for the lifetime of the warm container.
# modal.Dict was deprecated and removed in newer Modal SDK versions, and a
# module-level from_name() call crashes the container before FastAPI starts.
manifest_cache: dict = {}


# ── Trainer class — heavy imports snapshotted per container via @enter() ──────

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

        from piro.data.sequences import generate_sorting_dataset
        from piro.trainer import Trainer as _Trainer, TrainerConfig
        from piro.ctm import ContinuousThoughtModel, CTMConfig
        from piro.baseline_transformer import BaselineTransformer, TransformerConfig
        from model.memory_encoding import memory_embedding
        from model.weight_serialization import round_nested_numbers

        # Expose to run()
        self._torch = torch
        self._generate_sorting_dataset = generate_sorting_dataset
        self._Trainer = _Trainer
        self._TrainerConfig = TrainerConfig
        self._ContinuousThoughtModel = ContinuousThoughtModel
        self._CTMConfig = CTMConfig
        self._BaselineTransformer = BaselineTransformer
        self._TransformerConfig = TransformerConfig
        self._memory_embedding = memory_embedding

        # Configs
        self._ctm_cfg = CTMConfig(
            n_neurons=4,
            embed_dim=8,
            query_dim=8,
            value_dim=8,
            hidden_dim=16,
            n_classes=5,
        )
        self._transformer_cfg = TransformerConfig(
            embed_dim=8,
            n_heads=2,
            ffn_dim=6,
            n_layers=2,
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
        import uuid as _uuid
        from datetime import datetime, timedelta, timezone

        import psycopg2
        from model.weight_serialization import round_nested_numbers

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
            if data_source == "sorting-sequences" and dataset_r2_prefix.rstrip("/").endswith("/sorting-sequences"):
                seqs = self._generate_sorting_dataset(
                    n=n, length=self._ctm_cfg.n_neurons, seed=seed, split=split
                )
                samples = []
                for seq in seqs:
                    numbers = list(seq.sequence)
                    emb = torch.zeros(self._ctm_cfg.n_neurons, self._ctm_cfg.embed_dim, device=device)
                    for i, val in enumerate(numbers):
                        idx = min(val, self._ctm_cfg.embed_dim - 1)
                        emb[i, idx] = 1.0
                    label = numbers.index(min(numbers))
                    samples.append((emb, label))
                return samples

            if data_source != "associative-recall":
                raise ValueError(
                    "the Modal trainer supports sorting-sequences and associative-recall datasets"
                )

            r2 = _r2_client(os)
            key = f"{dataset_r2_prefix.rstrip('/')}/train.jsonl"
            response = r2.get_object(Bucket=R2_BUCKET, Key=key)
            records = [json.loads(line) for line in response["Body"].read().decode("utf-8").splitlines() if line.strip()]
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
        # The first invocation claims queued→running. Resumed invocations
        # retain the run lease and refresh the attempt deadline.
        now = datetime.now(timezone.utc)
        started_at = persisted_started_at or now
        timeout_at = now + timedelta(seconds=TRAINING_DEADLINE_SECONDS)
        if resume:
            cur.execute(
                'UPDATE training_run SET "heartbeatAt" = %s, "timeoutAt" = %s WHERE id = %s AND status = %s',
                (now, timeout_at, run_id, "running"),
            )
        else:
            cur.execute(
                'UPDATE training_run SET status = %s, "startedAt" = %s, "heartbeatAt" = %s, "timeoutAt" = %s, "resourceType" = %s, "gpuType" = %s, "cpuCores" = %s, "memoryMb" = %s WHERE id = %s AND status = %s',
                (
                    "running", started_at, now, timeout_at, "gpu", TRAINING_GPU,
                    TRAINING_CPU, TRAINING_MEMORY_MB, run_id, "queued",
                ),
            )
        if cur.rowcount != 1:
            conn.rollback()
            cur.close()
            conn.close()
            print(f"[piro] run {run_id} was not claimable; skipping worker")
            return
        conn.commit()

        try:
            # ── Build model ───────────────────────────────────────────────────
            random.seed(seed)
            torch.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)

            if data_source == "associative-recall" and model_template not in {"ctm", "ctm-10x"}:
                raise ValueError(
                    "associative-recall training requires the stateful ctm architecture"
                )

            if model_template in {"ctm", "ctm-10x"}:
                if data_source == "associative-recall":
                    cfg = self._memory_ctm_10x_cfg if model_template == "ctm-10x" else self._memory_ctm_cfg
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
            elif model_template == "baseline-transformer":
                cfg = self._transformer_cfg
                model = self._BaselineTransformer(cfg).to(device)
                config_dict = {
                    "template": "baseline-transformer",
                    "embed_dim": cfg.embed_dim,
                    "n_heads": cfg.n_heads,
                    "ffn_dim": cfg.ffn_dim,
                    "n_layers": cfg.n_layers,
                    "n_classes": cfg.n_classes,
                }
            else:
                raise ValueError(f"Unknown model_template: {model_template!r}")

            # Persist architecture and training-budget config immediately.
            config_dict["maxSteps"] = max_steps
            config_dict["checkpointIntervalSteps"] = CHECKPOINT_INTERVAL_STEPS
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
                eval_interval=CHECKPOINT_INTERVAL_STEPS,
            )
            trainer = self._Trainer(model, trainer_cfg)
            history: list[dict] = []
            order = list(range(len(train_data)))
            cursor = 0
            start_step = 0
            r2 = _r2_client(os)

            def _memory_prediction(
                episode: tuple[tuple[str, ...], str, str],
                *,
                train_mode: bool,
            ):
                import torch.nn.functional as F

                observations, query, value = episode
                model.reset()
                for packet in observations:
                    for observation in packet.splitlines():
                        if not observation.strip():
                            continue
                        model(
                            self._memory_embedding(
                                observation,
                                cfg.embed_dim,
                                torch_module=torch,
                                dtype=next(model.parameters()).dtype,
                                device=next(model.parameters()).device,
                            ),
                            preserve_graph=train_mode,
                        )
                output = model(
                    self._memory_embedding(
                        f"QUERY:{query}",
                        cfg.embed_dim,
                        torch_module=torch,
                        dtype=next(model.parameters()).dtype,
                        device=next(model.parameters()).device,
                    ),
                    preserve_graph=train_mode,
                )
                logits = output.logits if hasattr(output, "logits") else output
                target = int(value.removeprefix("value_"))
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

            def _save_checkpoint(step: int) -> None:
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
                checkpointed_at = datetime.now(timezone.utc)
                cur.execute(
                    """
                    UPDATE training_run
                    SET "currentStep" = %s,
                        "stepHistoryJson" = %s,
                        "checkpointR2Key" = %s,
                        "checkpointStep" = %s,
                        "checkpointAt" = %s,
                        "heartbeatAt" = %s,
                        "timeoutAt" = %s
                    WHERE id = %s AND status = 'running'
                    """,
                    (
                        step,
                        json.dumps(history),
                        key,
                        step,
                        checkpointed_at,
                        checkpointed_at,
                        checkpointed_at + timedelta(seconds=TRAINING_DEADLINE_SECONDS),
                        run_id,
                    ),
                )
                if cur.rowcount != 1:
                    conn.rollback()
                    raise RuntimeError("training run became terminal while checkpointing")
                conn.commit()

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

            def _memory_step(batch: list) -> float:
                model.train()
                trainer.optimizer.zero_grad()
                losses = []
                for episode in batch:
                    _, _, loss = _memory_prediction(episode, train_mode=True)
                    losses.append(loss)
                    model.reset()
                loss = torch.stack(losses).mean()
                loss.backward()
                trainer.optimizer.step()
                return float(loss.detach())

            def _memory_evaluate(data: list) -> tuple[float, float]:
                total_loss = 0.0
                correct = 0
                model.eval()
                for episode in data:
                    with torch.no_grad():
                        logits, target, loss = _memory_prediction(episode, train_mode=False)
                    total_loss += float(loss.detach())
                    correct += int(int(logits.argmax().item()) == target)
                    model.reset()
                count = max(1, len(data))
                return total_loss / count, correct / count

            def _spawn_resume() -> None:
                Trainer().run.spawn(
                    run_id=run_id,
                    model_name=model_name,
                    model_template=model_template,
                    data_source=data_source,
                    dataset_r2_prefix=dataset_r2_prefix,
                    max_steps=max_steps,
                    seed=seed,
                    resume=True,
                )

            _load_checkpoint()
            for step in range(start_step + 1, max_steps + 1):
                now = datetime.now(timezone.utc)
                if now + timedelta(seconds=CHECKPOINT_SAFETY_SECONDS) >= timeout_at:
                    _save_checkpoint(step - 1)
                    _spawn_resume()
                    print(f"[piro] run {run_id} checkpointed at step {step - 1}; spawned resume")
                    return

                batch = _next_batch()
                if data_source == "associative-recall":
                    train_loss = _memory_step(batch)
                else:
                    train_loss = trainer._train_step(batch)

                if step % CHECKPOINT_INTERVAL_STEPS != 0 and step != max_steps:
                    continue

                if data_source == "associative-recall":
                    val_loss, val_acc = _memory_evaluate(val_data)
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
                _save_checkpoint(step)

            # ── Serialize + upload model weights to R2 ───────────────────────
            # Allocate the model ID before deriving its R2 prefix.
            model_id = str(_uuid.uuid4())
            state = {key: value.detach().cpu() for key, value in model.state_dict().items()}

            # Binary .pt file for inference
            pt_buf = io.BytesIO()
            torch.save(state, pt_buf)
            pt_bytes = pt_buf.getvalue()

            # JSON file for visualization: {key: [[...], ...] or [...]}
            weights_json_str = json.dumps({
                k: round_nested_numbers(v.tolist()) for k, v in state.items()
            })

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
            print(f"[piro] uploaded weights to R2: {r2_prefix}/ ({len(pt_bytes)} bytes .pt, {len(weights_json_str)} bytes .json)")

            # ── Final training_run update ─────────────────────────────────────
            last = history[-1]
            completed_at = datetime.now(timezone.utc)
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
            completed_at = datetime.now(timezone.utc)
            runtime_ms = int((completed_at - started_at).total_seconds() * 1000)
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
            cur.close()
            conn.close()


# ── Infer class — loads model weights on first call, caches per container ──────

@app.cls(
    image=image,
    secrets=[piro_secrets],
    timeout=120,
)
class Infer:
    @modal.enter()
    def setup(self):
        import io
        import json
        import os
        import re

        import psycopg2
        import torch

        self._io = io
        self._json = json
        self._os = os
        self._re = re
        self._psycopg2 = psycopg2
        self._torch = torch
        from piro.ctm import ContinuousThoughtModel, CTMConfig
        from piro.baseline_transformer import BaselineTransformer, TransformerConfig
        from model.memory_encoding import memory_embedding
        self._CTM = ContinuousThoughtModel
        self._CTMConfig = CTMConfig
        self._Transformer = BaselineTransformer
        self._TransformerConfig = TransformerConfig
        self._memory_embedding = memory_embedding

        # model_id → (model, cfg_dict) — persists across warm calls
        self._cache: dict = {}

        print("[piro-infer] container ready")

    def _load(self, model_id: str):
        """Load model from R2 weights and cache it."""
        if model_id in self._cache:
            return self._cache[model_id]

        # Fetch R2 key prefix + configJson from DB
        conn = self._psycopg2.connect(self._os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute(
            """
            SELECT m."weightsR2Key", tr."configJson"
            FROM model m
            JOIN model_training_run mtr ON mtr."modelId" = m.id
            JOIN training_run tr ON tr.id = mtr."trainingRunId"
            WHERE m.id = %s
            """,
            (model_id,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row or not row[0]:
            raise ValueError(f"No weights stored for model {model_id!r} — retrain to populate")
        if not row[1]:
            raise ValueError(f"No configJson for model {model_id!r} — retrain to populate")

        r2_prefix, config_json_str = row
        cfg = self._json.loads(config_json_str)
        template = cfg.get("template")
        torch = self._torch

        if template in {"ctm", "ctm-10x"}:
            model_cfg = self._CTMConfig(
                n_neurons=cfg["n_neurons"],
                embed_dim=cfg["embed_dim"],
                query_dim=cfg["query_dim"],
                value_dim=cfg["value_dim"],
                hidden_dim=cfg["hidden_dim"],
                n_classes=cfg["n_classes"],
            )
            model = self._CTM(model_cfg)
        elif template == "baseline-transformer":
            model_cfg = self._TransformerConfig(
                embed_dim=cfg["embed_dim"],
                n_heads=cfg["n_heads"],
                ffn_dim=cfg["ffn_dim"],
                n_layers=cfg["n_layers"],
                n_classes=cfg["n_classes"],
            )
            model = self._Transformer(model_cfg)
        else:
            raise ValueError(f"Unknown template: {template!r}")

        # Download weights.pt from R2
        r2 = _r2_client(self._os)
        resp = r2.get_object(Bucket=R2_BUCKET, Key=f"{r2_prefix}/weights.pt")
        pt_bytes = resp["Body"].read()
        buf = self._io.BytesIO(pt_bytes)
        state = torch.load(buf, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        model.eval()

        self._cache[model_id] = (model, cfg)
        print(f"[piro-infer] loaded {model_id} ({template}, {sum(p.numel() for p in model.parameters())} params) from R2 {r2_prefix}/")
        return self._cache[model_id]

    def _build_emb(self, seq: list[int], embed_dim: int) -> "torch.Tensor":
        """One-hot-ish embedding: position i gets a 1 at min(value, embed_dim-1)."""
        torch = self._torch
        emb = torch.zeros(len(seq), embed_dim)
        for i, val in enumerate(seq):
            emb[i, min(int(val), embed_dim - 1)] = 1.0
        return emb

    def _argmin_chunk(self, model, template: str, chunk: list[int], n_neurons: int, embed_dim: int) -> int:
        """Run one model forward pass; return the value at the predicted argmin position."""
        torch = self._torch
        actual = len(chunk)
        # Pad with embed_dim-1 sentinel (largest encodable value) to fill n_neurons slots
        padded = chunk + [embed_dim - 1] * (n_neurons - actual)
        emb = self._build_emb(padded, embed_dim)
        with torch.no_grad():
            out = model(emb)
            logits = out.logits if hasattr(out, "logits") else out
        # Only consider logits for actual (non-padded) positions
        idx = int(logits[:actual].argmax().item())
        return chunk[idx]

    def _find_min(self, model, template: str, numbers: list[int], n_neurons: int, embed_dim: int) -> int:
        """Recursively find the minimum using model as an argmin oracle."""
        if len(numbers) <= n_neurons:
            return self._argmin_chunk(model, template, numbers, n_neurons, embed_dim)
        # Divide into chunks, get min of each, then recurse
        candidates = [
            self._argmin_chunk(model, template, numbers[i:i + n_neurons], n_neurons, embed_dim)
            for i in range(0, len(numbers), n_neurons)
        ]
        return self._find_min(model, template, candidates, n_neurons, embed_dim)

    def _sort(self, model, template: str, numbers: list[int], n_neurons: int, embed_dim: int) -> list[int]:
        """Selection sort using model as argmin oracle."""
        remaining = list(numbers)
        result = []
        while remaining:
            if len(remaining) == 1:
                result.append(remaining[0])
                break
            min_val = self._find_min(model, template, remaining, n_neurons, embed_dim)
            result.append(min_val)
            remaining.remove(min_val)
        return result

    def _json_state(self, value):
        """Convert a CTM snapshot into JSON-safe values for the next request."""
        if hasattr(value, "detach"):
            return value.detach().cpu().tolist()
        if isinstance(value, dict):
            return {key: self._json_state(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._json_state(item) for item in value]
        return value

    def _load_json_state(self, model, payload: dict):
        """Rebuild a JSON CTM snapshot with the model's device and dtypes."""
        torch = self._torch
        parameter = next(model.parameters())
        dtype = parameter.dtype
        device = parameter.device

        def tensor(value, *, tensor_dtype=dtype):
            return torch.tensor(value, dtype=tensor_dtype, device=device)

        state = {
            "previous_activations": (
                tensor(payload["previous_activations"])
                if payload.get("previous_activations") is not None
                else None
            ),
            "history_entries": [tensor(entry) for entry in payload.get("history_entries", [])],
        }
        if "plastic_weights" in payload:
            state["plastic_weights"] = tensor(payload["plastic_weights"])
            state["plastic_ticks"] = int(payload.get("plastic_ticks", 0))
        if "burst_counter" in payload:
            state["burst_counter"] = tensor(payload["burst_counter"], tensor_dtype=torch.long)
            state["refractory_counter"] = tensor(
                payload.get("refractory_counter", []), tensor_dtype=torch.long
            )
        if "phases" in payload:
            state["phases"] = tensor(payload["phases"])
        return state

    def _associative_step(self, model, cfg: dict, input_text: str, state: dict | None) -> tuple[str, dict]:
        if cfg.get("template") not in {"ctm", "ctm-10x"}:
            raise ValueError("associative-recall inference requires a CTM model")

        import torch

        if state is None:
            model.reset()
        else:
            model.load_state(self._load_json_state(model, state))

        parameter = next(model.parameters())
        answer = "ACK"
        for observation in input_text.splitlines():
            observation = observation.strip()
            if not observation:
                continue
            is_query = "=" not in observation and not observation.startswith("token_")
            encoded = self._memory_embedding(
                f"QUERY:{observation}" if is_query else observation,
                cfg["embed_dim"],
                torch_module=torch,
                dtype=parameter.dtype,
                device=parameter.device,
            )
            output = model(encoded)
            if is_query:
                logits = output.logits if hasattr(output, "logits") else output
                answer = f"value_{int(logits.argmax().item()):03d}"

        return answer, self._json_state(model.snapshot_state())

    @modal.method()
    def generate(
        self,
        model_id: str,
        prompt: str = "",
        input: str | None = None,
        state: dict | None = None,
    ) -> dict:
        """Run one sorting prompt or one stateful associative-recall invocation."""
        import time
        t0 = time.time()

        try:
            model, cfg = self._load(model_id)
            if input is not None:
                text, next_state = self._associative_step(model, cfg, input, state)
                return {
                    "text": text,
                    "state": next_state,
                    "durationMs": int((time.time() - t0) * 1000),
                }
        except Exception as exc:
            return {"text": "", "error": str(exc), "durationMs": 0}

        template = cfg["template"]
        n_neurons = cfg.get("n_neurons", cfg.get("embed_dim", 4))
        chunk_size = cfg.get("n_neurons", 4)
        embed_dim = cfg["embed_dim"]
        match = self._re.search(r'\[([^\]]+)\]', prompt)
        if not match:
            return {"text": "", "durationMs": int((time.time() - t0) * 1000)}
        try:
            numbers = [int(x.strip()) for x in match.group(1).split(',')]
        except ValueError:
            return {"text": "", "durationMs": int((time.time() - t0) * 1000)}

        sorted_nums = self._sort(model, template, numbers, chunk_size, embed_dim)
        return {
            "text": " ".join(str(x) for x in sorted_nums),
            "durationMs": int((time.time() - t0) * 1000),
        }


# ── Web endpoints ─────────────────────────────────────────────────────────────

# ── Source generation ─────────────────────────────────────────────────────────

@app.function(image=image, secrets=[piro_secrets], timeout=3600)
def generate_source(body: dict) -> dict:
    """Execute a repository source and persist its JSONL dataset in R2."""
    import json
    import os
    import subprocess
    import sys
    import tempfile
    import urllib.request
    from datetime import datetime, timezone

    callback_url = str(body.get("callbackUrl", ""))
    callback_secret = str(body.get("secret", ""))
    r2_prefix = str(body.get("r2Prefix", "")).strip()
    source = body.get("source")
    entrypoint = str(body.get("entrypoint", "main.py"))

    if not callback_url or not r2_prefix or not isinstance(source, str) or not source.strip():
        raise ValueError("callbackUrl, r2Prefix, and source are required")
    if entrypoint not in {"main.py", "model.py", "script.py"}:
        raise ValueError("unsupported source entrypoint")

    def callback(payload: dict) -> None:
        request = urllib.request.Request(
            callback_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Piro-Secret": callback_secret,
            },
            method="PATCH",
        )
        with urllib.request.urlopen(request, timeout=30):
            pass

    callback({"status": "running"})
    try:
        with tempfile.TemporaryDirectory() as directory:
            source_file = os.path.join(directory, entrypoint)
            with open(source_file, "w", encoding="utf-8") as handle:
                handle.write(source)

            runtime_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            inherited_pythonpath = os.environ.get("PYTHONPATH", "")
            child_env = {
                key: os.environ[key]
                for key in ("PATH", "LANG", "LC_ALL")
                if key in os.environ
            }
            child_env["PYTHONPATH"] = os.pathsep.join(
                path for path in (runtime_root, inherited_pythonpath) if path
            )
            result = subprocess.run(
                [sys.executable, source_file],
                cwd=directory,
                env=child_env,
                capture_output=True,
                text=True,
                timeout=3300,
                check=False,
            )
            if result.returncode != 0:
                detail = result.stderr.strip() or result.stdout.strip() or "source exited with an error"
                raise RuntimeError(detail[-4000:])

            records = []
            for line_number, line in enumerate(result.stdout.splitlines(), start=1):
                if not line.strip():
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"source emitted invalid JSON on line {line_number}: {exc}") from exc

            if not records:
                raise RuntimeError("source emitted no dataset records")

            train_jsonl = "".join(json.dumps(record, separators=(",", ":")) + "\n" for record in records)
            generated_at = datetime.now(timezone.utc).isoformat()
            metadata = {
                "sourcePath": body.get("sourcePath"),
                "entrypoint": entrypoint,
                "sampleCount": len(records),
                "generatedAt": generated_at,
            }
            r2 = _r2_client(os)
            prefix = r2_prefix.rstrip("/")
            r2.put_object(Bucket=R2_BUCKET, Key=f"{prefix}/train.jsonl", Body=train_jsonl.encode("utf-8"), ContentType="application/x-ndjson")
            r2.put_object(Bucket=R2_BUCKET, Key=f"{prefix}/metadata.json", Body=json.dumps(metadata, indent=2).encode("utf-8"), ContentType="application/json")
            callback({"status": "complete", "sampleCount": len(records), "generatedAt": generated_at})
            return {"ok": True, "sampleCount": len(records)}
    except Exception as exc:
        try:
            callback({"status": "error", "error": str(exc)[-4000:]})
        except Exception:
            pass
        raise


@app.function(image=image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def source(body: dict) -> dict:
    """Queue execution of a source-generation request."""
    import os
    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")
    for field in ("runId", "callbackUrl", "r2Prefix", "source"):
        if not body.get(field):
            raise HTTPException(status_code=400, detail=f"{field} required")

    generate_source.spawn(body)
    return {"ok": True, "runId": body["runId"]}


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
    model_template = architecture_path.rstrip("/").rsplit("/", 1)[-1] or "ctm"
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


@app.function(image=serialize_image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="GET")
def serialize(request: Request) -> dict:
    """
    Return a ModelManifest for a model class stored in R2.

    Query params:
        class_id : str  — the UUID from the model_class DB row

    Headers:
        X-Piro-Secret : str  — must match MODAL_WEBHOOK_SECRET

    Response:
        ModelManifest as camelCase JSON (same shape as ClassManifest in TS)

    Caching:
        Result is cached in modal.Dict keyed by sha256(model.py source).
        Pass ?bust=true to skip the cache (forces re-execution + re-cache).
    """
    import hashlib
    import importlib.util
    import os
    import sys
    import tempfile
    import traceback

    try:
        from fastapi import HTTPException
    except Exception as _e:
        raise RuntimeError(f"fastapi import failed: {_e}") from _e

    try:
        from piro import PiroModel
        from piro.schema import ModelManifest
    except Exception as _e:
        tb = traceback.format_exc()
        raise RuntimeError(f"piro import failed: {_e}\n\n{tb}") from _e

    # Outer safety net — catches anything that slips past inner try/except
    # blocks and surfaces it as a proper HTTPException with full traceback
    # (instead of Modal's bare "Internal Server Error").
    try:
        return _serialize_inner(
            request, hashlib, importlib, os, sys, tempfile, traceback,
            HTTPException, PiroModel, ModelManifest,
        )
    except HTTPException:
        raise
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[piro-serialize] UNCAUGHT: {tb}")
        raise HTTPException(status_code=500, detail=f"Uncaught: {type(exc).__name__}: {exc}\n\n{tb}")


def _serialize_source(model_source, cache_key, context_label, bust,
                      importlib, os, sys, tempfile, traceback,
                      HTTPException, PiroModel, ModelManifest):
    """Execute a repository architecture source and return its JSON manifest."""
    if len(model_source.encode("utf-8")) > 1_000_000:
        raise HTTPException(status_code=413, detail="Architecture source exceeds 1 MB")

    if not bust and cache_key in manifest_cache:
        print(f"[piro-serialize] cache hit {context_label} ({cache_key[:12]})")
        return manifest_cache[cache_key]

    with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w") as f:
        f.write(model_source)
        tmp_path = f.name

    module_name = f"_piro_user_model_{cache_key[:16]}"
    try:
        spec = importlib.util.spec_from_file_location(module_name, tmp_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)  # type: ignore[union-attr]
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[piro-serialize] ERROR exec'ing {context_label}:\n{tb}")
        raise HTTPException(status_code=500, detail=f"model.py exec failed — {type(exc).__name__}: {exc}\n\n{tb}")
    finally:
        sys.modules.pop(module_name, None)
        os.unlink(tmp_path)

    model_cls = None
    for attr_name in dir(module):
        obj = getattr(module, attr_name, None)
        if (
            obj is not None
            and isinstance(obj, type)
            and issubclass(obj, PiroModel)
            and obj is not PiroModel
        ):
            model_cls = obj
            break

    if model_cls is not None:
        try:
            manifest_obj: ModelManifest = model_cls.serialize()
            result = manifest_obj.model_dump(by_alias=True, mode="json")
        except Exception as exc:
            tb = traceback.format_exc()
            print(f"[piro-serialize] ERROR in {model_cls.__name__} ({context_label}):\n{tb}")
            raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}\n\n{tb}")
    elif hasattr(module, "serialize") and callable(module.serialize):
        raw: dict = module.serialize()
        manifest_obj = ModelManifest.model_validate(raw)
        result = manifest_obj.model_dump(by_alias=True, mode="json")
    else:
        raise HTTPException(
            status_code=422,
            detail="model.py must define a PiroModel subclass with .serialize() "
                   "or a module-level serialize() function",
        )

    print(f"[piro-serialize] computed manifest for {context_label} ({cache_key[:12]})")
    manifest_cache[cache_key] = result
    return result


def _serialize_inner(request, hashlib, importlib, os, sys, tempfile, traceback,
                     HTTPException, PiroModel, ModelManifest):
    """Inner serialize logic — called from serialize() with all imports passed in."""
    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and request.headers.get("X-Piro-Secret", "") != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    class_id = request.query_params.get("class_id")
    if not class_id:
        raise HTTPException(status_code=400, detail="class_id required")

    bust = request.query_params.get("bust") == "true"

    # ── Fetch model.py from R2 ─────────────────────────────────────────────
    # _r2_client is called inside try so a missing env var surfaces as a
    # proper 500 HTTPException with traceback, not a bare Modal "Internal
    # Server Error".
    try:
        r2 = _r2_client(os)
        r2_key = f"classes/{class_id}/model.py"
        resp = r2.get_object(Bucket=R2_BUCKET, Key=r2_key)
        model_source: str = resp["Body"].read().decode("utf-8")
    except HTTPException:
        raise
    except Exception as exc:
        import traceback as _tb
        tb = _tb.format_exc()
        print(f"[piro-serialize] ERROR fetching {r2_key!r}:\n{tb}")
        raise HTTPException(status_code=500, detail=f"R2 fetch failed — {type(exc).__name__}: {exc}\n\n{tb}")

    cache_key = hashlib.sha256(model_source.encode()).hexdigest()
    return _serialize_source(
        model_source,
        cache_key,
        f"class {class_id}",
        bust,
        importlib,
        os,
        sys,
        tempfile,
        traceback,
        HTTPException,
        PiroModel,
        ModelManifest,
    )

@app.function(image=serialize_image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
async def serialize_source(request: Request) -> dict:
    """Serialize a GitHub-backed architecture source supplied by Piro."""
    import hashlib
    import importlib.util
    import os
    import sys
    import tempfile
    import traceback

    from fastapi import HTTPException
    from piro import PiroModel
    from piro.schema import ModelManifest

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and request.headers.get("X-Piro-Secret", "") != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {exc}")

    source = body.get("source") if isinstance(body, dict) else None
    if not isinstance(source, str) or not source.strip():
        raise HTTPException(status_code=400, detail="source is required")

    cache_key = hashlib.sha256(source.encode()).hexdigest()
    return _serialize_source(
        source,
        cache_key,
        "repository architecture",
        body.get("bust") is True,
        importlib,
        os,
        sys,
        tempfile,
        traceback,
        HTTPException,
        PiroModel,
        ModelManifest,
    )


@app.function(image=image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def infer(body: dict) -> dict:
    """
    Run inference on a trained Piro model.

    Body:
        {
            "model_id": str,
            "prompt":   str,                 # sorting inference
            "input":    str,                 # one Ashfall invocation
            "state":    dict | null,         # prior CTM snapshot for Ashfall
            "secret":   str,
        }

    Response:
        { "text": str, "state": dict, "durationMs": int }
    """
    import os
    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")

    model_id = body.get("model_id")
    prompt = body.get("prompt", "")
    input_text = body.get("input")
    state = body.get("state")
    if not model_id:
        raise HTTPException(status_code=400, detail="model_id required")
    if input_text is not None and (not isinstance(input_text, str) or not input_text.strip()):
        raise HTTPException(status_code=400, detail="input must be a non-empty string")
    if state is not None and not isinstance(state, dict):
        raise HTTPException(status_code=400, detail="state must be an object")
    if input_text is None and (not isinstance(prompt, str) or not prompt.strip()):
        raise HTTPException(status_code=400, detail="prompt required")

    inferrer = Infer()
    return inferrer.generate.remote(
        model_id=model_id,
        prompt=prompt,
        input=input_text,
        state=state,
    )
