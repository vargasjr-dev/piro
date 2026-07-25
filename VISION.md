# Piro — Vision

> **The model becomes yours.**
>
> Piro is a small, stateful model that learns an owner's way of thinking through interaction, stores that learning in its own independently owned parameters, and becomes more useful without requiring the owner to carry the entire past conversation into every prompt.

---

## The Thesis

The first useful personal model does not need to know everything. It needs to understand **one person well**.

Piro is not trying to build a smaller generic frontier assistant. It is trying to build a model that learns and retains an owner's:

- hard constraints;
- preferences and priorities;
- tradeoffs;
- exceptions;
- workflows;
- communication patterns;
- ways of deciding under changing circumstances.

The central product promise is stronger than retrieval and stronger than a long system prompt:

> Two identical initial models can become two different owners' models through different interaction streams, and the learned difference survives history removal, process restart, and future learning.

The model is not merely carrying a profile. **The model itself becomes personalized.**

---

## What Piro Is

Piro is:

- a stateful research model built from scratch around the CTM architecture;
- a model with explicit working state and persistent weights;
- a fully independently mutable parameter set for each owner;
- a system that learns relational policies, not merely isolated facts;
- a small model optimized first for bounded personal intelligence, not universal knowledge;
- a path toward affordable dedicated intelligence for ordinary consumers.

Piro is not initially:

- a smaller ChatGPT competitor on broad world knowledge;
- a retrieval system that claims retrieved facts are learned intelligence;
- a random key/value memory benchmark presented as personal intelligence;
- a shared base model with a thin per-user adapter;
- a model whose behavior depends on replaying the entire owner transcript at inference time.

Training algorithms may evolve. The non-negotiable product property is independent, persistent personalization.

---

## North Star: Persistent Relational Personalization

The benchmark that matters most is not generic chatbot quality. It is whether a small model can become **someone's model** through interaction and apply that learned policy to new situations.

### Why random associative recall is insufficient

The current associative-recall task—write random keys and values, add distractors, then query a key—is a useful low-level state diagnostic. It can show that information survives a boundary, reset, or serialization cycle.

It is not yet personal intelligence. The values have no relationship to one another, and the task can be solved as a hash map. Success does not show that the model learned an owner's priorities, constraints, tradeoffs, exceptions, or way of deciding.

Associative recall remains a **diagnostic**, not the North Star.

### North Star protocol

1. Start two identical 20,047-parameter Piro checkpoints with identical initialization.
2. Give each model a different owner's interaction stream containing choices, corrections, preferences, priorities, and exceptions.
3. Train each model only on its own stream. Do not share owner profiles, adapters, or evaluation context.
4. Evaluate on held-out situations that require applying learned relations to new combinations of entities and circumstances.
5. Remove the interaction history and owner profile from the evaluation prompt.
6. Compare each personalized model with the untouched checkpoint and a history-only baseline.
7. Save each personalized parameter set, terminate the process, reload the weights in a fresh runtime, and repeat the evaluation.
8. Teach a second policy set and measure whether the model learns it without destroying previously validated behavior.

### A North Star pass requires

- personalization improves held-out owner-specific policy accuracy;
- two identical initial models produce measurably different, owner-consistent decisions;
- learned behavior transfers to novel combinations rather than exact training examples;
- the behavior survives prompt-history removal and a full save/load/restart cycle;
- the result comes from a bounded number of high-signal interactions, not a massive transcript;
- new learning does not erase old learning beyond an explicit regression budget.

This is the core claim: **the model becomes yours.** Parameter count, general benchmark breadth, and serving throughput are subordinate to proving this loop honestly.

---

## The 20K Benchmark: Owner Policy Worlds

The first real personalization dataset is a set of small synthetic worlds with relational policies. It is designed for the current **Ashfall CTM-10x model: exactly 20,047 trainable parameters**.

### Dataset structure

Each owner has a compact policy graph containing:

- entities: foods, activities, tools, destinations, tasks, people, and resources;
- attributes: ingredients, cost, time, effort, risk, urgency, category, and availability;
- relations: contains, substitutes-for, requires, conflicts-with, enables, precedes, and preferred-over;
- policy rules: choose, avoid, rank, defer, ask-first, or perform-next;
- ordered priorities and weighted tradeoffs;
- exceptions and corrections that refine the policy.

Different owners share the same semantic vocabulary but have conflicting policies. The model must infer the policy from interactions rather than receive a serialized owner profile.

### Teaching interactions

Each owner receives a deterministic stream of approximately 32–64 interactions. Each interaction contains:

1. a situation;
2. two to four candidate actions;
3. the owner's selected action;
4. an optional correction or explanation;
5. a consequence or follow-up that makes the rule relational.

Example:

```text
Situation: lunch before a meeting in 20 minutes.
Options: cheese sandwich | hummus wrap.
Owner choice: hummus wrap.
Correction: dairy proteins are not safe, even when the food looks vegetarian.
```

The stream must include positive examples, negative examples, corrections, and explicit exceptions. The answer to an evaluation prompt must not simply be copied from the teaching stream.

### Evaluation probes

The held-out set must be split by composition, not just random rows:

- **Novel combination:** known entities and relations recombined into a new situation;
- **Surface variation:** the same policy expressed through new templates and orderings;
- **Conflicting-owner pair:** the same situation given to owners with different priorities;
- **Multi-hop policy reasoning:** at least two relations must be composed to select the answer.

At 20K, controlled structured packets are preferable to pretending the model has broad natural-language fluency. Readable text can remain in the dataset for inspection, but the model input must preserve reusable semantic factors. Hashing each complete sentence independently would destroy the relational structure we are trying to measure.

### Evaluation conditions

Every owner is evaluated under six conditions:

1. **Untouched:** initial checkpoint, no owner interactions;
2. **History-only:** initial checkpoint with the owner stream supplied as runtime context;
3. **Personalized:** owner updates applied, history removed;
4. **Restarted personalized:** weights saved, process terminated, weights reloaded, history removed;
5. **Reset control:** runtime state cleared and owner updates absent;
6. **After new learning:** a second policy set is learned, then both old and new policies are tested.

The history-only condition prevents a false claim that behavior lives in weights when it actually lives in the prompt. The reset control separates durable parameters from transient working state.

### Initial 20K greenlight targets

These are research gates, not permanent product claims:

- at least **70%** accuracy on four-choice relational probes, versus a 25% random baseline;
- at least **20 percentage points** of personalization gain over the untouched checkpoint;
- at least **80%** accuracy on conflicting-owner paired probes;
- at least **90%** restart retention;
- no more than **10%** relative regression on previously validated policies after new learning.

A result does not count if it only improves exact phrase matching, direct recall, or prompts that reveal the owner's answer.

The detailed dataset and benchmark design lives in [`docs/research-persistent-personalization-20k.md`](docs/research-persistent-personalization-20k.md).

---

## Current State

- **Current architecture:** Ashfall CTM-10x.
- **Current size:** 20,047 trainable parameters.
- **Baseline size:** 2,005 parameters.
- **Current experiment:** associative recall with variable-length observation histories.
- **What the current experiment proves:** low-level state, delayed recall, reset, and serialization behavior.
- **What it does not yet prove:** persistent owner-specific relational personalization.
- **Immediate next research task:** build the Owner Policy Worlds dataset and run the North Star protocol at 20K.

The 20K model is a mechanism laboratory. We should use it to answer whether the personalization loop works, not spend months optimizing a toy recall score.

---

## Model Scale Roadmap

| Scale | Role | Gate to move forward |
|---:|---|---|
| **20K** | Mechanism lab and first North Star test | Persistent relational personalization survives history removal and restart |
| **100K–250K** | Capacity and compositionality check | The North Star signal survives beyond a lookup-like regime |
| **~2M** | Serious personalization research model | Richer policies, more varied interactions, stronger transfer |
| **~10M** | First bounded chat-style demonstration | Personalization becomes visible in useful conversational workflows |
| **256M** | Product-scale dedicated model | The learned mechanism is worth scaling and the economics remain attractive |

We do not need to reach 10M before testing the core idea. We also do not scale to 2M merely because a larger model might hide an unresolved learning problem.

### What transfers from 20K

The 20K model can validate:

- state boundaries and reset semantics;
- weight/state persistence;
- save/load and process-restart behavior;
- owner divergence methodology;
- plasticity and consolidation rules;
- replay and forgetting controls;
- evaluation design and regression budgets.

These mechanisms transfer to larger models. Language breadth, fluency, and the best hyperparameters will require retuning at each scale.

---

## Dedicated-Model Economics

Piro's initial serving assumption is **full parameter independence**. Every customer receives a complete parameter set that is independently owned, mutable, persisted, and loaded. We are not sharing a base model or relying on LoRA/adapters for the initial architecture.

The initial hardware target is:

- **96 fully independent models resident on one H100 80GB**;
- **256M BF16 parameters per model**;
- approximately **24.6B total resident parameters per H100**;
- BF16 as the canonical format for continually mutable weights;
- FP8 and INT4 as future serving optimizations, not assumptions in the base economics;
- all 96 models loaded simultaneously for the first economics model, rather than relying on cold-model eviction.

This is a memory-and-cost target, not a throughput guarantee. Concurrent serving, activation memory, update synchronization, and runtime overhead still require measurement.

The economics favor a smaller number of fully mutable, high-fidelity parameters over a larger quantized model whose representation complicates continual learning. One user per model is acceptable. One permanently dedicated GPU per user is not.

---

## Design Commitments

1. **Personalization over generic benchmark theater.** The first headline is that the model becomes yours.
2. **Relational learning over lookup tests.** Evaluation must require reusable policies, tradeoffs, and exceptions.
3. **Weights over transcript dependence.** Learned behavior must survive history removal and restart.
4. **Full ownership first.** Each user gets an independent parameter set; shared-base approaches are deferred.
5. **BF16 canonical weights first.** Optimize serving precision later without making quantization the learning substrate.
6. **Small experiments before expensive scale.** Prove the mechanism at 20K, then earn 2M, 10M, and 256M.
7. **Regression is a failure.** New learning must not silently destroy validated personal capabilities.
8. **Diagnostics are not product claims.** Associative recall can validate memory plumbing, but it cannot stand in for personal intelligence.

---

## What We Are Not Doing Now

- We are not building a general-purpose frontier model.
- We are not using the old Opus-judge/PKM framing as the current product thesis.
- We are not treating GRPO, a reward API, or a particular trainer as the definition of Piro.
- We are not claiming random key/value recall demonstrates personal intelligence.
- We are not starting with LoRA or a shared frozen base.
- We are not scaling model size before the 20K personalization mechanism produces a real signal.

---

## One-Sentence Version

> **Piro is a small model that learns an owner's relational policies through interaction, stores them in independently owned weights, survives restart without the original history, and grows into an affordable personal intelligence.**

---

*Vision reset: July 25, 2026.*
*Current North Star: persistent relational personalization at 20,047 parameters.*
