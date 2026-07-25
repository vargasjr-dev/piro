# Piro Core Self-Updating Model — v0.2

**Date:** July 25, 2026
**Scope:** the smallest architecture that can test fast/slow self-updating weights

## One-sentence thesis

Piro is a model that learns from its observed stream by updating a session-local
fast-weight state while preserving a slower durable weight substrate.

## What is core

The baseline architecture contains only these responsibilities:

- **Observation** — receives the current multimodal input packet.
- **Embed** — maps the packet into a shared model representation.
- **PredictNextToken** — predicts the next observed text token or chunk.
- **FastAdaptation** — updates selected fast weights from causal prediction loss.
- **BindFastState** — combines durable weights with the active fast state.
- **OutputHead** — produces the response using the current runtime weights.
- **WeightPersistencePolicy** — decides whether to keep, checkpoint, or consolidate
  the fast state.
- **ConsolidateWeights** — proposes durable changes only when evidence is stable
  and replay checks do not regress validated capabilities.
- **SaveWeights** — writes a model-scope durable revision or a session checkpoint.

There is no required recurrent thought loop, synchronization mechanism, learned
halting policy, timestamped history buffer, or specialized memory-attention stack
in this baseline. Those may become useful later; they are not assumptions we need
to prove the central self-updating-weights idea.

## Top-level architecture contract

```text
durableWeights = LoadWeights()
fastState = InitializeFastState(durableWeights, sessionId)
x = Embed(PiroInput)
runtimeWeights = BindFastState(durableWeights, fastState)
output = []

for each observedChunk in ChunkText(x.text):
    prediction = PredictNextToken(observedChunk, runtimeWeights)
    fastState = FastAdaptation(
        fastState,
        observedChunk,
        prediction
    )
    runtimeWeights = BindFastState(durableWeights, fastState)
    output.append(OutputHead(runtimeWeights))

persistence = WeightPersistencePolicy(fastState)

if persistence.mode == "consolidate":
    durableWeights = ConsolidateWeights(durableWeights, fastState)
    SaveWeights(durableWeights, scope = "model")
elif persistence.mode == "session-checkpoint":
    SaveWeights(fastState, scope = "session")

return output
```

The observed token or chunk is the free causal target for the next prediction.
Fast adaptation happens inside the stream so later observations can benefit from
what was learned earlier in the same episode. The baseline does not claim that
fast weights are an exact record store; exact personal facts need an explicit
addressable retrieval path when that capability is tested.

## State and lifetime boundaries

| State             | Lifetime             | Purpose                                        |
| ----------------- | -------------------- | ---------------------------------------------- |
| `PiroInput` / `x` | current request      | normalized observation and representation      |
| `fastState`       | process or session   | mutable contextual learning state              |
| `runtimeWeights`  | current forward pass | durable weights plus fast state                |
| `durableWeights`  | model revision       | stable knowledge and validated personalization |

A fast update is not automatically a durable model revision. Runtime fast state
may remain in memory. A session checkpoint is optional and scoped to one session.
Durable consolidation is deliberate, replay-protected, and infrequent relative
to online adaptation.

## Training plan

1. Train a small text-first model on causal episodes rather than isolated samples.
2. Meta-train or otherwise optimize the initial weights for performance after fast
   adaptation, not only before it.
3. Start with synthetic tasks: continuation, changing rules, distribution shifts,
   delayed consequences, interference/recovery, and persistent personalization.
4. Compare no adaptation, fast adaptation, and fast adaptation plus consolidation.
5. Measure online learning speed, retained capability, restart behavior, exact
   retrieval through an explicit path, and regression after consolidation.
6. Add multimodal training after the text learning loop is stable.

## Deferred CTM exploration

CTM remains a legitimate research hypothesis, but it is not part of the baseline.
A later CTM experiment may add:

- recurrent latent thought state,
- multiple internal computation steps,
- synchronization-driven attention,
- learned halting or adaptive compute,
- timestamped working history, and
- richer delayed-credit dynamics.

The CTM experiment must beat the simpler fast/slow baseline on a named capability
for its added complexity to be justified. Candidate tests include delayed credit,
adaptive computation, multimodal temporal synchronization, sample efficiency,
and quality per unit of compute.

## Success criteria for the baseline

The first milestone is not a benchmark score. It is a causal demonstration that
fast/slow self-updating improves at least one of:

- online adaptation speed,
- persistent personalization after restart,
- recovery after a distribution shift, or
- sample efficiency under changing rules,

without unacceptable regression on capabilities the durable model already had.

## Open questions

1. Which parameters should be writable fast state, and at what capacity?
2. What fast learning rule is stable under long episodes?
3. When is evidence strong enough for durable consolidation?
4. How should exact retrieval be exposed without making fast weights an addressable
   database?
5. Which result would justify promoting CTM from exploration to the core?
