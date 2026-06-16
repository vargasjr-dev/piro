"""
model/modal_app.py

Modal app for Piro training (and eventually inference).

Deploy
------
    modal deploy model/modal_app.py

This registers two endpoints on Modal:
  - train_model   : internal function, called by spawn()
  - trigger       : web endpoint, called by Vercel POST /api/training-runs

Environment
-----------
Modal secret named "piro-secrets" must contain:
  DATABASE_URL          — Neon Postgres connection string
  MODAL_WEBHOOK_SECRET  — shared secret between Vercel and Modal

Vercel env vars needed:
  MODAL_TRAINING_ENDPOINT  — the /trigger URL printed after `modal deploy`
  MODAL_WEBHOOK_SECRET     — same value as in the Modal secret
"""

import modal

# ── App ───────────────────────────────────────────────────────────────────────

app = modal.App("piro")

# Python image with training dependencies
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


# ── Training function ─────────────────────────────────────────────────────────

@app.function(
    image=image,
    secrets=[piro_secrets],
    timeout=600,  # 10 min max per run
)
def train_model(
    run_id: str,
    model_template: str,
    data_source: str,
    epochs: int,
    seed: int = 42,
) -> None:
    """
    Execute one training run and write results back to Neon.

    Flow:
      1. Mark training_run row as 'running'
      2. Build model (CTM or BaselineTransformer) + dataset
      3. Run Trainer.fit()
      4. Write final metrics + epoch history → status = 'complete'
      5. On any exception → status = 'error' with message
    """
    import json
    import os
    import random
    from datetime import datetime, timezone

    import psycopg2
    import torch

    from model.baseline_transformer import BaselineTransformer, TransformerConfig
    from model.ctm import ContinuousThoughtModel, CTMConfig
    from model.data.sequences import generate_sorting_dataset
    from model.trainer import Trainer, TrainerConfig

    # ── Model configs (mirror train.py) ──────────────────────────────────────
    CTM_CFG = CTMConfig(
        n_neurons=4,
        embed_dim=8,
        query_dim=8,
        value_dim=4,
        hidden_dim=16,
        n_classes=5,
    )
    TRANSFORMER_CFG = TransformerConfig(
        embed_dim=8,
        n_heads=2,
        ffn_dim=6,
        n_layers=2,
        n_classes=5,
    )

    def _build_dataset(n: int, split: str) -> list:
        """Convert SequenceSamples → (embedding_tensor, label) pairs."""
        seqs = generate_sorting_dataset(
            n=n, length=CTM_CFG.n_neurons, seed=seed, split=split
        )
        samples = []
        for seq in seqs:
            numbers = list(seq.sequence)
            emb = torch.zeros(CTM_CFG.n_neurons, CTM_CFG.embed_dim)
            for i, val in enumerate(numbers):
                idx = min(val, CTM_CFG.embed_dim - 1)
                emb[i, idx] = 1.0
            label = numbers.index(min(numbers))  # argmin task
            samples.append((emb, label))
        return samples

    # ── DB ────────────────────────────────────────────────────────────────────
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # Mark as running
    cur.execute(
        'UPDATE training_run SET status = %s WHERE id = %s',
        ("running", run_id),
    )
    conn.commit()

    try:
        # ── Build model ───────────────────────────────────────────────────────
        random.seed(seed)
        torch.manual_seed(seed)

        if model_template == "ctm":
            model = ContinuousThoughtModel(CTM_CFG)
        elif model_template == "baseline-transformer":
            model = BaselineTransformer(TRANSFORMER_CFG)
        else:
            raise ValueError(f"Unknown model_template: {model_template!r}")

        # ── Build dataset ─────────────────────────────────────────────────────
        train_data = _build_dataset(500, "train")
        val_data = _build_dataset(100, "val")

        # ── Train ─────────────────────────────────────────────────────────────
        cfg = TrainerConfig(epochs=epochs, seed=seed, log_every=1)
        history = Trainer(model, cfg).fit(train_data, val_data)

        # ── Persist ───────────────────────────────────────────────────────────
        last = history[-1]
        epoch_history_json = json.dumps(
            [
                {
                    "epoch": m.epoch,
                    "trainLoss": m.train_loss,
                    "valLoss": m.val_loss,
                    "valAccuracy": m.val_accuracy,
                }
                for m in history
            ]
        )

        cur.execute(
            """
            UPDATE training_run
            SET
                status             = %s,
                "finalTrainLoss"   = %s,
                "finalValLoss"     = %s,
                "finalValAccuracy" = %s,
                "epochHistoryJson" = %s,
                "completedAt"      = %s
            WHERE id = %s
            """,
            (
                "complete",
                float(last.train_loss),
                float(last.val_loss),
                float(last.val_accuracy),
                epoch_history_json,
                datetime.now(timezone.utc),
                run_id,
            ),
        )
        conn.commit()
        print(
            f"[piro] run {run_id} complete — "
            f"val_acc={last.val_accuracy:.3f}  val_loss={last.val_loss:.4f}"
        )

    except Exception as exc:
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

    Expected body:
        {
            "runId":         "<uuid>",
            "modelTemplate": "ctm" | "baseline-transformer",
            "dataSource":    "sorting-sequences",
            "epochs":        10,
            "seed":          42,
            "secret":        "<MODAL_WEBHOOK_SECRET>"
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

    train_model.spawn(
        run_id=run_id,
        model_template=body.get("modelTemplate", "ctm"),
        data_source=body.get("dataSource", "sorting-sequences"),
        epochs=int(body.get("epochs", 10)),
        seed=int(body.get("seed", 42)),
    )

    return {"ok": True, "runId": run_id}
