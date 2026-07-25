# Phase 0 Tasks — CTM Core + Benchmark Runner

## Setup

- Create `/model` directory in piro repo with `README.md` describing the architecture research code structure (separate from Next.js app)
- Add `pyproject.toml` to `/model` with uv as the package manager and PyTorch, numpy, matplotlib, and tqdm as Phase 0 dependencies (never use requirements.txt)
- Add `model/` to `.gitignore` exceptions so Python training code is tracked alongside the app

## B1 — Benchmark Infrastructure

- Implement `benchmarks/base.py`: abstract `Benchmark` base class with `run(model) -> BenchmarkResult` interface, where `BenchmarkResult` contains `score: float`, `baseline_scores: dict`, `passed: bool`, `metadata: dict`
- Implement `benchmarks/models.py`: `GPTBaseline` adapter class wrapping the OpenAI API — accepts a model name string (e.g. `"gpt-4o-mini"`, `"gpt-4o"`) and exposes the same interface as our model for benchmark evaluation
- Implement `benchmarks/run.py`: runs all registered benchmarks against three targets — weakest GPT (gpt-4o-mini), strongest GPT (gpt-4o), and our model (stub returning random scores for now) — prints formatted score table, saves `benchmarks/results/latest.json`
- Add `bench` script to `package.json`: `"bench": "uv run python benchmarks/run.py"`
- Add `--benchmark <name>` flag to `run_benchmarks.py` to run a single benchmark in isolation
- Add `--model <name>` flag to run benchmarks against a single target instead of all three

## B2 — Benchmark: OOD Generalization

- Implement `benchmarks/ood_generalization.py`: generates sorting sequences of length N (train) and 4×N (test); evaluates each model on the test set by prompting with the sequence and checking if output matches ground-truth sorted order
- Add sequence generation utility: random integer sequences with ground-truth sorted output as labels, serialized as plain text prompts for GPT compatibility
- Report fields: accuracy at 4×N per model, sample count, example failures

## B3 — Benchmark: Adaptive Compute

- Implement `benchmarks/adaptive_compute.py`: generates easy tasks (single-step: "what is 2+2?") and hard tasks (multi-step: chained arithmetic reasoning); records tick count for our model and response latency (ms) as a compute proxy for GPT models
- Statistical test: Mann-Whitney U on tick counts (our model) and latency (GPT) to confirm hard tasks use significantly more compute than easy tasks (p < 0.05 = pass)
- Report fields: mean ticks/latency for easy vs hard per model, p-value, pass/fail

## B4 — Benchmark: Calibration

- Implement `benchmarks/calibration.py`: runs each model on a held-out multi-choice classification set; for GPT models extract confidence from logprobs (top token probability); bins predictions by confidence decile; computes Expected Calibration Error (ECE)
- Threshold: ECE < 0.05 = pass
- Save calibration curve plot to `benchmarks/results/calibration_[timestamp].png`
- Report fields: ECE per model, curve plot path, pass/fail

## QA-1 — Benchmark UX (Mobile)

- QA: run `bun run bench` and verify the terminal score table renders cleanly — columns aligned, no line wrapping on a standard 80-char terminal
- QA: open `/benchmarks` page on mobile — verify all 8 benchmark cards are readable, scores visible, no horizontal scroll, pass/fail badges are large enough to tap
- QA: verify the "no runs yet" empty state looks correct on mobile before any benchmark data exists
- QA: verify that after posting `latest.json` via `POST /api/benchmarks`, the dashboard updates without a page reload (or refreshes gracefully)

## D1 — Benchmark Results API

- Add `benchmark_run` table to Drizzle schema: `id`, `benchmark_id`, `ctm_score`, `gpt_mini_score`, `gpt_max_score`, `passed`, `metadata` (JSON), `run_at`
- Add `POST /api/benchmarks` route: accepts `latest.json` payload from the CLI runner, validates shape, inserts one row per benchmark
- Add `GET /api/benchmarks` route: returns all runs grouped by benchmark, ordered by `run_at` desc
- Run `db:generate` to create a migration, then apply it through the database migration workflow

## D2 — Live Benchmarks Dashboard

- Update `/benchmarks` page to fetch real data from `GET /api/benchmarks` instead of the static list
- For each benchmark: show CTM score, gpt-4o-mini score, gpt-4o score, pass/fail badge, and last run timestamp
- Add a sparkline of CTM score history across runs for each benchmark (simple inline SVG, no chart library)
- Empty state preserved for benchmarks with no runs yet

## QA-2 — Live Dashboard UX (Mobile)

- QA: seed the DB with one fake benchmark run and verify the live scores render correctly on mobile — three score columns visible, no overflow
- QA: verify sparklines render at mobile width (375px) without clipping
- QA: verify pass/fail badge colors (green/red) are accessible contrast on the amber dark background
- QA: verify the page loads in under 2 seconds on a simulated slow connection (Chrome devtools: Fast 3G)

## A1 — Neuron With Memory

- Implement `NeuronHistory` class: stores a rolling window of size W of past activations for a single neuron
- Implement `NeuronModel` class: a tiny 2-layer MLP (private to each neuron) that takes the history window as input and outputs the next activation scalar
- Implement `NeuronLayer` class: N neurons in parallel, each with their own `NeuronModel` weights and `NeuronHistory` buffer — forward pass runs all N private MLPs simultaneously
- Write unit test: verify that two neurons with different weight initializations produce different outputs for the same input history

## A2 — Synchronization Matrix

- Implement `SyncMatrix` class: given the activation history buffer (shape: N neurons × W timesteps), compute the N×N pairwise Pearson correlation matrix
- Implement efficient batched correlation using PyTorch tensor ops (no Python loops over neuron pairs)
- Write unit test: verify that perfectly in-phase neurons produce correlation 1.0, perfectly out-of-phase produce -1.0, and independent neurons produce ~0.0

## A3 — Attention Over Input

- Implement `SyncAttention` class: takes the sync matrix (N×N) as the query source and the input embedding as key/value — produces a context vector representing "what to focus on next given current synchronization state"
- The sync matrix is flattened and projected to query space; input tokens are projected to key/value space; standard scaled dot-product attention produces the context vector
- Write unit test: verify that attention weights sum to 1.0 and that identical sync matrices produce identical attention outputs

## A4 — Confidence Head + Tick Loop

- Implement `ConfidenceHead` class: small MLP that takes the sync matrix as input and outputs a scalar confidence score in [0, 1]
- Implement `TickLoop` function: runs up to MAX_TICKS iterations of (attend → update neurons → recompute sync matrix → check confidence); stops early if confidence exceeds threshold
- Add tick count logging so every forward pass records how many ticks were used
- Write unit test: verify that the loop terminates early on a trivially simple input and runs to MAX_TICKS on a random input with untrained weights

## A5 — Output Head + End-to-End Forward Pass

- Implement `OutputHead` class: MLP that takes the final sync matrix and produces a probability distribution over classes (softmax output)
- Wire all components into a single `ContinuousThoughtModel` class with a clean `forward(x) -> (logits, confidence, tick_count)` interface
- Write end-to-end smoke test: random input → forward pass → verify output shape, confidence is scalar in [0,1], tick_count is integer ≤ MAX_TICKS
- Add `architectures/train.py` with a minimal training loop (cross-entropy loss, Adam optimizer, 10-epoch toy run on random data) to verify gradients flow through the full graph

## A6 — Transformer Baseline

- Implement `BaselineTransformer` class: minimal 2-layer transformer (multi-head attention + FFN) with the same parameter budget as the CTM (match total parameter count within 10%)
- Implement shared `Trainer` class that can train either model with the same loop, optimizer settings, and data pipeline — ensures fair comparison
- Add `benchmarks/compare.py` script: trains both models on the same dataset, prints side-by-side parameter count and training loss, then runs all three benchmarks against gpt-4o-mini, gpt-4o, baseline transformer, and our CTM

## QA-3 — Full Benchmark Suite (Mobile)

- QA: run the full benchmark suite with all four targets and verify the CLI table fits cleanly at 80 chars wide with four score columns
- QA: verify the dashboard benchmark table on mobile handles four score columns (gpt-mini, gpt-max, transformer, CTM) — use horizontal scroll within the table if needed, not full page scroll
- QA: verify that a passing benchmark shows a clearly visible green badge and a failing one shows red on both desktop and mobile
- QA: verify sparklines update correctly after a second benchmark run is posted

## E — Commit + PR

- Commit all Phase 0 model code, benchmark runner, and dashboard updates to a `phase-0-ctm-core` branch
- Open PR with description linking to VISION.md architecture roadmap and showing the first real four-way benchmark results table (gpt-4o-mini vs gpt-4o vs transformer vs CTM)
- Phase 0 closes when all three starter benchmarks have real results for all four models
