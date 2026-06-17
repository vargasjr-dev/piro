"""
model/modal_app.py

Modal app for Piro training (and eventually inference).

Deploy
------
    modal deploy model/modal_app.py

This registers two Modal endpoints:
  - Trainer (cls)  : .run() called by spawn() — heavy imports in @enter()
  - trigger        : web endpoint called by Vercel POST /api/training-runs

Cold start mitigation
---------------------
All heavy imports (torch, model code) live in @modal.enter(), which runs
once per container lifetime and is snapshotted. Warm container reuse means
subsequent calls skip the import overhead entirely.

Environment
-----------
Modal secret named "piro-secrets" must contain:
  DATABASE_URL          — Neon Postgres connection string
  MODAL_WEBHOOK_SECRET  — shared secret between Vercel and Modal

Vercel env vars needed:
  MODAL_TRAINING_ENDPOINT  — the /trigger URL printed after `modal deploy`
"""

import modal

app = modal.App("piro")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.3.0",
        "numpy>=1.26.0",
        "psycopg2-binary>=2.9",
        "fastapi[standard]>=0.110.0",
    )
    .add_local_python_source("model")
)

piro_secrets = modal.Secret.from_name("piro-secrets")

# ── Hyperparameter config (kept in sync with model/train.py) ─────────────────

CTM_CFG = None      # set in enter()
TRANSFORMER_CFG = None


# ── Trainer class — heavy imports snapshotted per container via @enter() ──────

@app.cls(
    image=image,
    secrets=[piro_secrets],
    timeout=3600,  # 1 hr max per run
)
class Trainer:
    @modal.enter()
    def setup(self):
        """Runs once per container — imports are snapshotted, not re-run on warm reuse."""
        import torch  # noqa: F401 — imported here so warm containers skip re-import

        from model.baseline_transformer import BaselineTransformer, TransformerConfig
        from model.ctm import ContinuousThoughtModel, CTMConfig
        from model.data.sequences import generate_sorting_dataset
        from model.trainer import Trainer as _Trainer, TrainerConfig, EpochMetrics

        # Expose to run()
        self._torch = torch
        self._ContinuousThoughtModel = ContinuousThoughtModel
        self._CTMConfig = CTMConfig
        self._BaselineTransformer = BaselineTransformer
        self._TransformerConfig = TransformerConfig
        self._generate_sorting_dataset = generate_sorting_dataset
        self._Trainer = _Trainer
        self._TrainerConfig = TrainerConfig
        self._EpochMetrics = EpochMetrics

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

        print("[piro] container ready — torch + model code loaded")

    @modal.method()
    def run(
        self,
        run_id: str,
        model_name: str | None,
        model_template: str,
        data_source: str,
        epochs: int,
        seed: int,
    ) -> None:
        import json
        import os
        import random
        import uuid as _uuid
        from datetime import datetime, timezone

        import psycopg2

        torch = self._torch

        def _build_dataset(n: int, split: str) -> list:
            seqs = self._generate_sorting_dataset(
                n=n, length=self._ctm_cfg.n_neurons, seed=seed, split=split
            )
            samples = []
            for seq in seqs:
                numbers = list(seq.sequence)
                emb = torch.zeros(self._ctm_cfg.n_neurons, self._ctm_cfg.embed_dim)
                for i, val in enumerate(numbers):
                    idx = min(val, self._ctm_cfg.embed_dim - 1)
                    emb[i, idx] = 1.0
                label = numbers.index(min(numbers))
                samples.append((emb, label))
            return samples

        # ── DB ────────────────────────────────────────────────────────────────
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()

        # Fetch userId (needed to create model row on completion)
        cur.execute('SELECT "userId" FROM training_run WHERE id = %s', (run_id,))
        row = cur.fetchone()
        user_id: str = row[0] if row else ""

        # Record startedAt — this is AFTER cold start, so queuedAt→startedAt = cold start latency
        started_at = datetime.now(timezone.utc)
        cur.execute(
            'UPDATE training_run SET status = %s, "startedAt" = %s WHERE id = %s',
            ("running", started_at, run_id),
        )
        conn.commit()

        try:
            # ── Build model ───────────────────────────────────────────────────
            random.seed(seed)
            torch.manual_seed(seed)

            if model_template == "ctm":
                model = self._ContinuousThoughtModel(self._ctm_cfg)
            elif model_template == "baseline-transformer":
                model = self._BaselineTransformer(self._transformer_cfg)
            else:
                raise ValueError(f"Unknown model_template: {model_template!r}")

            # ── Build dataset ─────────────────────────────────────────────────
            train_data = _build_dataset(500, "train")
            val_data = _build_dataset(100, "val")

            # ── Train with per-epoch progress + timing writes ─────────────────
            cfg = self._TrainerConfig(epochs=epochs, seed=seed, log_every=0)
            trainer = self._Trainer(model, cfg)
            history = []

            for epoch in range(1, epochs + 1):
                epoch_start = datetime.now(timezone.utc)

                train_data_copy = list(train_data)
                train_loss = trainer._train_epoch(train_data_copy)
                val_loss, val_acc = trainer._eval_epoch(val_data)

                epoch_end = datetime.now(timezone.utc)
                duration_ms = int((epoch_end - epoch_start).total_seconds() * 1000)

                m = self._EpochMetrics(
                    epoch=epoch,
                    train_loss=train_loss,
                    val_loss=val_loss,
                    val_accuracy=val_acc,
                )
                history.append(m)

                print(
                    f"[piro] run {run_id} epoch {epoch}/{epochs} — "
                    f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f}  "
                    f"val_acc={val_acc:.3f}  duration_ms={duration_ms}"
                )

                partial_history_json = json.dumps([
                    {
                        "epoch": h.epoch,
                        "trainLoss": h.train_loss,
                        "valLoss": h.val_loss,
                        "valAccuracy": h.val_accuracy,
                        "durationMs": duration_ms if h.epoch == epoch else None,
                    }
                    for h in history
                ])
                cur.execute(
                    """
                    UPDATE training_run
                    SET "currentEpoch" = %s, "epochHistoryJson" = %s
                    WHERE id = %s
                    """,
                    (epoch, partial_history_json, run_id),
                )
                conn.commit()

            # ── Final update ──────────────────────────────────────────────────
            last = history[-1]
            cur.execute(
                """
                UPDATE training_run
                SET
                    status             = %s,
                    "finalTrainLoss"   = %s,
                    "finalValLoss"     = %s,
                    "finalValAccuracy" = %s,
                    "completedAt"      = %s
                WHERE id = %s
                """,
                (
                    "complete",
                    float(last.train_loss),
                    float(last.val_loss),
                    float(last.val_accuracy),
                    datetime.now(timezone.utc),
                    run_id,
                ),
            )
            conn.commit()

            # ── Create model + model_training_run rows ────────────────────────
            param_count = sum(p.numel() for p in model.parameters())
            resolved_name = (
                model_name.strip()
                if model_name and model_name.strip()
                else f"{model_template}-{run_id[:8]}"
            )
            model_id = str(_uuid.uuid4())
            cur.execute(
                """
                INSERT INTO model (id, "userId", name, "parameterCount", "createdAt")
                VALUES (%s, %s, %s, %s, NOW())
                """,
                (model_id, user_id, resolved_name, param_count),
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
                f"val_acc={last.val_accuracy:.3f}  val_loss={last.val_loss:.4f}  "
                f"model_id={model_id}  name={resolved_name!r}"
            )

        except BaseException as exc:
            cur.execute(
                """
                UPDATE training_run
                SET status = %s, error = %s, "completedAt" = %s
                WHERE id = %s
                """,
                ("error", str(exc), datetime.now(timezone.utc), run_id),
            )
            conn.commit()
            raise

        finally:
            cur.close()
            conn.close()


# ── Web endpoint ──────────────────────────────────────────────────────────────

@app.function(image=image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def trigger(body: dict) -> dict:
    """
    Accept a training request from Vercel, spawn it async, return 200 immediately.

    Body:
        {
            "runId":         str,
            "modelName":     str | null,
            "modelTemplate": "ctm" | "baseline-transformer",
            "dataSource":    "sorting-sequences",
            "epochs":        int,
            "seed":          int,
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

    trainer = Trainer()
    trainer.run.spawn(
        run_id=run_id,
        model_name=body.get("modelName"),
        model_template=body.get("modelTemplate", "ctm"),
        data_source=body.get("dataSource", "sorting-sequences"),
        epochs=int(body.get("epochs", 10)),
        seed=int(body.get("seed", 42)),
    )

    return {"ok": True, "runId": run_id}
