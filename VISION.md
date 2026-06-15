# Piro — Vision

> A platform where anyone can train their own tiny, RL-first model — built to grow, not decay — eventually running as the kernel of a personal OS.

---

## The Thesis

Every frontier model today is built the same way:
1. Pretrain on the entire internet (next-token prediction, no reward)
2. SFT to make it chat-friendly
3. Bolt on RL as a post-training afterthought

RL is an afterthought. It's applied to a model that already has baked-in behaviors and biases from a data corpus no one person chose.

**We flip that.** RL is not phase 3 — it is the organizing principle from the beginning. A model that learns through interaction and reward from day one. Not trained on the internet. Trained on *you.*

The bet: a smaller, purpose-built, RL-first model that knows you deeply is more valuable than a general model that shallowly knows everyone.

---

## The Innovation Stack

### 1. PKM-Backed Opus Judge as Reward Function

Instead of human raters or abstract principles, the reward signal is:

```
Student generates response
    ↓
Opus (with user's PKM context injected) scores the response (0.0 → 1.0)
    ↓
Score becomes the RL reward
```

The judge isn't generic. It's Opus with *your* data injected — journal entries, conversation history, project context, preferences, decision patterns. The student is learning to satisfy *your* evaluator.

This is **personalized knowledge distillation via RL**: using a context-augmented judge model to transfer individual preference structure into a small student model. At inference time, Opus is no longer needed — the personalization is baked into the student's weights.

### 2. RL-First Architecture

- GRPO (Group Relative Policy Optimization) — the student generates N responses per prompt, Opus scores all N, the model learns which behaviors scored higher relative to the group
- No separate reward model needed
- No labeled human preference dataset needed
- The reward function is the judge + PKM context, and it gets richer over time as the PKM grows

### 3. Tiny and Fast

Starting at ~10M parameters (sub-GPT-2). The model is not trying to be a general assistant. It is a **preference-pattern recognizer** — a fast system that has deeply internalized how the owner thinks and what they want, capable of running in milliseconds on a laptop.

This is the right constraint. Speed and locality are features, not limitations.

### 4. Continual Learning That Builds, Not Decays

**Learning moment detection** — not every interaction is worth training on. The system detects three high-signal categories:

- **Correction moments**: Student was confident, judge scored low. Highest information density.
- **Discovery moments**: Student was uncertain, judge scored high. Something good found by accident.
- **Drift moments**: Judge scoring shifts on previously-stable prompt types. Owner preferences evolved.

Everything else is discarded — the noisy middle band is not a learning signal.

**Build-not-decay mechanisms:**
1. Never update on single events — every update pass includes new learning moments *plus* replay from the historical "gold" interaction core set
2. Asymmetric learning rates — build fast (discoveries), correct slow (corrections). Single correction events nudge, they don't nuke.
3. The consolidation pass (the "sleep cycle") — buffer online, never apply raw. Once daily/weekly: run regression → apply buffer → re-run regression → roll back if anything decayed. Learning only merges into weights when it's proven not to destroy prior capability.

**The capability map** — the model doesn't just get better at one thing. It accumulates layers:
- Early: communication preferences, tone
- Mid: project context, domain vocabulary, decision patterns
- Later: anticipation, situation-type recognition
- Mature: cross-domain reasoning — applying patterns from one project to another because it understands *how* the owner thinks, not just *what* they've said

---

## The Recursive Edge

The judge uses Opus to score responses. But the scoring rubric can also encode *what Opus gets wrong*. Logged moments where Opus's responses frustrated, missed the mark, or felt off become *negative* reward signal.

The student is trained to replicate Opus's successes AND avoid its failure modes. Over time, the student doesn't converge toward Opus-in-general — it converges toward **Opus-knowing-this-one-person**, with corrections applied for Opus's blind spots.

This is the version that genuinely innovates past the frontier model rather than just distilling it.

---

## The Flywheel

As the student improves → it generates higher-quality responses → judge gives more nuanced feedback → scoring rubric self-elevates → student is always stretched just past its current capability.

As the PKM grows → judge becomes more context-rich → reward signal becomes more precise → student internalizes deeper preference structures.

Student and judge co-evolve. That's the compounding mechanism.

---

## The Web App (Phase 1)

Scoped out of personal OS — standalone web app first. Core primitives:

| Primitive | Purpose |
|---|---|
| Student model | Tiny, local, fast (~10M params) |
| Interaction log | Every prompt + response stored |
| Learning moment detector | Confidence estimator + surprise scoring |
| Prioritized buffer | Tagged, ranked learning moments queued for update |
| PKM sync layer | Pull relevant context from notes/journal for Opus judge calls |
| Consolidation runner | Scheduled update + regression loop |
| Capability ledger | Tracks what the model can do, alerts on regression |

---

## Long-Term Trajectory

- **Phase 1 (Web App)**: Prove the loop. PKM-backed judge + GRPO + tiny student. Automated learning moment detection. Consolidation pass. Capability ledger.
- **Phase 2 (Depth)**: Richer PKM integration. Drift detection. Cross-domain pattern generalization. Model doubles or triples in size as capability justifies it.
- **Phase 3 (Personal OS Kernel)**: Student runs locally. PKM is live context, not just training data. Learns continuously from every interaction. Not an app — the thing that knows the operator of the machine.
- **Phase 4 (Own Hardware)**: Mounted on custom hardware. No cloud dependency. Full sovereignty.

---

## Benchmarks

Eight benchmarks that validate the CTM-style architectural thesis and tell a coherent story about personal intelligence. Built to prove that a small, architecturally honest model beats a large, brute-force one.

| # | Name | Question | Why It Matters for Piro |
|---|---|---|---|
| 1 | **Adaptive Compute Efficiency** | Does the model think as hard as the problem requires — no more, no less? | Personal devices can't waste compute. Adaptive ticks = economic advantage. |
| 2 | **OOD Generalization to Scale** | Trained on size N, tested on 4–10× N — did the model learn the rule or memorize examples? | Personal data is sparse by definition. Generalization from few examples is everything. |
| 3 | **Calibration Accuracy** | When the model says 70% confident, is it right 70% of the time? | A personal AI that hallucinates with full confidence is dangerous. Trustworthiness requires calibration. |
| 4 | **Constraint Satisfaction Under Backtracking** | Jones's Sudoku Bench — handcrafted variant Sudokus from Cracking the Cryptic. Current LLMs: ~15%. Humans: routine. | Tests genuine iterative reasoning. Transformers fail because one forward pass = no backtracking. CTMs iterate. |
| 5 | **Personalization Flywheel** | How fast does the model get useful on YOUR data? Accuracy at 10/50/500 personal facts vs. a frozen pretrained baseline. | This is the core Piro thesis operationalized. |
| 6 | **Sequential Procedure Following** | Multi-step instructions present in context — can the model execute the right step at the right time without losing the thread? | Real personal intelligence is "help me do this." Working memory and internal state maintenance across time. |
| 7 | **Catastrophic Forgetting Resistance** | Teach Corpus A, then Corpus B — how much of A survives? | If Piro learns your new job and forgets your wife's food allergies, it's broken. |
| 8 | **LLM Head-to-Head** | ARC-Challenge slice: can a 10M-param CTM get within 10–15 points of a 7B transformer at 1/700th the parameter count? | The press release benchmark. The headline: *"Piro matches GPT-4o performance-per-parameter by 5×."* |

---

## Architecture Research Roadmap

The Piro model is not a transformer fine-tune. It is a ground-up architecture built on what neuroscience actually tells us neurons do — implemented incrementally as each translation from biology to code becomes scientifically feasible.

**The thesis:** Biological intelligence doesn't correlate with raw neuron count (research shows r ≈ 0). AI intelligence shouldn't require raw parameter count either. What matters is *how* units are organized and *how* they communicate. That's the architecture bet.

### The Seven Behaviors — Research Phases

| Phase | Neuron Behavior | What We Build | Status |
|---|---|---|---|
| 0 | **Firing rate + Spike timing** | CTM from scratch: per-neuron history + synchronization matrix as representation + adaptive ticks | 🎯 Current |
| 1 | **Burst patterns** | Variable output sequence per neuron per step — neuron emits a short sequence shape, not just one float | Next |
| 2 | **Hebbian plasticity** | Local weight update rules alongside backprop — prevents catastrophic forgetting, enables the personalization flywheel | Critical for Piro moat |
| 3 | **Dendritic spikes** | Multi-compartment neurons: internal branches vote before the neuron produces output — one neuron = small network | Medium-term |
| 4 | **Oscillatory entrainment** | Global rhythm vectors that gate neuron participation — dynamic network reorganization by task type | Hard |
| 5 | **Neuromodulation** | Dynamic meta-parameters controlling plasticity — the model learns to control its own learning rate | Hard |

### Build Principles
- **From scratch, not a fork.** We borrow from Sakana's CTM paper conceptually. We write every line ourselves. This is how we learn the architecture deeply enough to evolve it beyond what Sakana published.
- **Benchmarks are the only proof.** The only valid evidence of progress beyond the transformer is benchmark results. Every phase ships with before/after scores. No benchmark score = no phase complete.
- **Phases complete on evidence, not time.** Each phase closes when benchmarks prove the feature works. No artificial deadlines.

### The Efficiency Bet

The human brain runs at 20W and performs ~10¹⁵–10¹⁷ FLOP-equivalents/second. An H100 GPU runs at 700W at ~2×10¹⁵ FLOPS. The brain is roughly 1,000–2,000× more compute-efficient per watt. That gap is the prize.

Closing it requires two things:
1. **Right architecture** (what we're building in Phases 0–5) → estimated 10–100× gain on existing hardware through sparsity and adaptive compute
2. **Right hardware** (neuromorphic chips, long-term) → the remaining 10–100× multiplier

Phases 0–5 target the software gains. Hardware is the Phase 4 product milestone (Own Hardware).

---

## What We're Not Doing

- Not trying to out-data the big labs on pretraining corpora
- Not fine-tuning an existing model and calling it innovation
- Not building a general assistant for anyone
- Not treating RL as a post-training polish step

---

## The One-Sentence Version

> A tiny model built from scratch on a new architecture — biologically honest, not transformer-derived — trained via RL on the owner's own knowledge, that builds compounding personal intelligence at a fraction of the compute cost of any frontier model.

---

## Compute Infrastructure (June 2026)

### Philosophy
Build the full thesis pipeline cheaply before owning hardware. Rent until $50K cumulative revenue, then buy a self-hosted H100. Long-term: H100 + home solar as the physical embodiment of the sun → intelligence pipeline.

### Architecture (pre-hardware)

**Inference — Modal Serverless**
- Platform: [Modal](https://modal.com) — serverless GPU, scales to zero when idle
- GPU: A10G (24GB) — sufficient for a 10M param model at any realistic concurrency
- Cost: ~$0.30-0.50/hr, billed per GPU-second (near-zero cost when no users active)
- Deployment: custom Modal function wrapping the student model weights
- Cold start: ~2-4 seconds (acceptable for chat UI)
- Capacity: one A10G can serve 500+ concurrent users at 10M params

**Training — Modal On-Demand**
- Platform: Modal (same account, different function)
- GPU: A100 80GB or H100 (rented only during training runs)
- Trigger: on-demand (weekly or when learning moment buffer exceeds threshold)
- Cost per run: ~$1.25-6 in GPU time (10M param GRPO runs are fast)
- Reward model: **Kimi K2 API** ($0.60/M input tokens) — no GPU needed for scoring
- Weights persisted to Modal Volumes or S3 between runs

**Training loop:**
```
Modal A100/H100 (on-demand)
  → generates N rollouts per prompt (policy model, 10M params)
  → calls Kimi K2 API for reward scores (PKM context injected)
  → GRPO update applied to policy weights
  → weights saved to persistent storage
  → GPU shuts down
```

**Storage**
- Model weights: Modal Volumes (versioned checkpoints)
- Interaction logs + learning moment buffer: persistent DB (Postgres/SQLite)
- PKM context: synced from workspace at training time

### Revenue Model
- User-facing product: personalized private AI at $20-30/month per user
- Target: 500 users = $10-15K/month on one A10G serving 10M params
- Hardware trigger: buy H100 (~$25K all-in) when $50K cumulative revenue hit
- Post-hardware: Modal inference → self-hosted inference; training stays Modal or moves home

### Hardware Roadmap
| Milestone | Trigger | Move |
|---|---|---|
| Phase 0 | Now | Modal serverless inference + on-demand training |
| Phase 1 | $50K revenue | Buy H100 PCIe 80GB + server (~$25K), self-host inference |
| Phase 2 | $200K revenue | Home solar installed, eliminate all power costs |
| Phase 3 | Scale | Multiple H100s, expand to full home data center |

---

*Started: May 30, 2026*
*Architecture thesis locked: June 14, 2026 — CTM-inspired, built from scratch, 7-phase neuroscience roadmap.*
*Status: Phase 0 starting — CTM implementation + benchmark runner.*
