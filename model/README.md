# Piro — Model Research & Training Code

This directory is separate from the Next.js web app (`/src`). It contains all architecture research, training scripts, and experimentation code for the Piro student model.

---

## Structure (planned)

```
model/
├── README.md              # This file
├── architecture/          # Model definition — transformer config, layer shapes
│   └── student.py         # ~10M param GPT-style student model
├── training/              # GRPO training loop
│   ├── grpo.py            # Group Relative Policy Optimization implementation
│   ├── rollout.py         # Generate N responses per prompt (the "group")
│   └── train.py           # Entry point: prompt batch → rollouts → score → update
├── scoring/               # Reward signal
│   └── mentor.py          # Calls mentor scoring API, maps JSON → reward tensors
├── data/                  # Training data pipeline
│   ├── pkm_loader.py      # Pull relevant context from KB (synced via /src integrations)
│   └── moment_detector.py # Correction / discovery / drift moment detection
├── consolidation/         # Build-not-decay mechanisms
│   ├── replay.py          # Gold interaction replay buffer
│   └── consolidation.py   # Scheduled update + regression loop
├── eval/                  # Capability ledger
│   └── capability_map.py  # Track what the model can do, alert on regression
└── modal_app.py           # Modal deployment: inference (A10G) + training (A100/H100)
```

---

## Philosophy

RL is not phase 3 — it is the organizing principle from day one. See [VISION.md](../VISION.md) for the full thesis.

### Key design decisions

**GRPO (Group Relative Policy Optimization)**
The student generates N responses per prompt. The mentor scores all N. The model learns which behaviors scored higher *relative to the group* — no separate reward model, no labeled preference dataset needed.

**Mentor as reward function**
Mentors are defined in the web app (`/mentors`) and called via API during training. Each mentor has a system prompt encoding a rubric. The scorer uses Anthropic tool_use for structured JSON output — no regex parsing.

**No pretraining corpus**
The student is not pretrained on the internet. RL is the training signal from scratch. The model learns to satisfy *your* evaluator, not a generic one.

**Build-not-decay**
Every update pass includes new learning moments *plus* replay from the historical gold core. Asymmetric learning rates: discoveries build fast, corrections correct slow. Updates only merge into weights after a regression check confirms nothing decayed.

---

## Compute

| Phase | GPU | Platform | Use |
|---|---|---|---|
| Research | CPU / free tier | Local / Colab | Architecture experiments, tiny runs |
| Training | A100 80GB | Modal (on-demand) | Full GRPO runs, triggered when buffer exceeds threshold |
| Inference | A10G 24GB | Modal serverless | Serve student model, scales to zero |

Training cost per run: ~$1.25–6 (10M params, GRPO is fast).
Reward scoring: Anthropic API (no GPU needed).

---

## Getting started (future)

```bash
# Install deps (Python 3.11+)
pip install -r requirements.txt

# Run a single GRPO step locally (CPU, tiny batch — for architecture validation)
python model/training/train.py --dry-run

# Deploy to Modal
modal deploy model/modal_app.py
```

---

## Status

🔬 **Research phase** — structure defined, implementation not yet started. The web app (`/src`) ships first to validate the KB sync pipeline and mentor rubric UX before the training loop is wired in.
