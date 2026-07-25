# Piro Stateful RL-First Model — v0.1

**Date:** July 25, 2026
**Scope:** pseudocode-first architecture contract for state, bounded working memory,
causal fast adaptation, delayed feedback, and deliberate persistence

## One-sentence thesis

Piro is a multimodal, stateful CTM with transient thought state, bounded working
memory, session-local fast weights, and durable weights whose updates are
explicitly separated and validated.

## Top-level architecture contract

The top-level architecture is intentionally expressed as pseudocode rather than
as a diagram. This is the primary contract for reasoning about Piro because it
makes the order of transformations, recurrent state, bounded history, observed
text, fast adaptation, and persistence boundaries explicit.

```text
durableWeights = LoadWeights()
fastState = InitializeFastState(durableWeights, sessionId)
attentionWindow = GetAttentionWindow(durableWeights)
x = Embed(PiroInput)
runtimeWeights = BindFastState(durableWeights, fastState)
h = InitializeOrRetrieveState(x, runtimeWeights)
history = []

for each observedChunk in ChunkText(x.text):
    prediction = PredictNextToken(observedChunk, h, runtimeWeights)
    fastState = FastAdaptation(
        fastState,
        observedChunk,
        prediction,
        runtimeWeights
    )
    runtimeWeights = BindFastState(durableWeights, fastState)

    for k = 0 ... Kmax:
        contextₖ = Attention(
            hₖ,
            historyₖ,
            x,
            k,
            attentionWindow,
            runtimeWeights
        )
        deltaₖ = ComputeStateDelta(
            hₖ,
            x,
            contextₖ,
            historyₖ,
            runtimeWeights
        )
        hₖ₊₁ = ApplyGatedStateUpdate(hₖ, gateₖ, deltaₖ)
        historyₖ₊₁ = UpdateHistory(historyₖ, hₖ₊₁, x, k)
        h = hₖ₊₁
        history = historyₖ₊₁

        if ShouldHalt(hₖ₊₁, k):
            break

output = OutputHead(h)
persistence = WeightPersistencePolicy(fastState, history)

if persistence.mode == "consolidate":
    durableWeights = ConsolidateWeights(durableWeights, fastState)
    SaveWeights(durableWeights, scope = "model")
elif persistence.mode == "session-checkpoint":
    SaveWeights(fastState, scope = "session")

return output
```

The model is intentionally text-first during initial training even though the
public observation API remains multimodal. `ChunkText` and `PredictNextToken`
make the causal observation stream explicit: the current observed token/chunk is
free supervision for predicting the next observed token/chunk. Fast adaptation is
therefore part of processing the stream, not a post-output write that runs only
after the answer is complete.

## Pseudocode method contracts

```text
weights = LoadWeights()

x = Embed(PiroInput)

h₀ = InitializeOrRetrieveState(x, weights)

for k = 0 ... Kmax:

    contextₖ = Attention(hₖ, historyₖ, x, k, weights)

    deltaₖ = ComputeStateDelta(
        hₖ,
        x,
        contextₖ,
        historyₖ,
        weights
    )

    hₖ₊₁ = ApplyGatedStateUpdate(hₖ, gateₖ, deltaₖ)

    historyₖ₊₁ = UpdateHistory(historyₖ, hₖ₊₁, x, k)

    if ShouldHalt(hₖ₊₁, k):
        outputₖ = OutputHead(hₖ₊₁)
        PlasticityController(
            hₖ₊₁,
            x,
            historyₖ₊₁
        )
        return outputₖ
```

`ShouldHalt` receives the current state and tick index inside each loop iteration in this working contract.
Prediction and halt heads are implementation details of `ShouldHalt`, not separate
top-level transformations. `historyₖ` is bounded short-term working memory for the
current process; it is not a durable model revision. `FastAdaptation` updates
selected BF16 fast-state groups from causal next-token prediction loss while the
observed text stream is being processed. `WeightPersistencePolicy` then chooses
no write, a session checkpoint, or deliberate durable consolidation.
`ConsolidateWeights` must be replay-safe and may reject a candidate that regresses
validated capabilities. The next inference loads durable weights through
`LoadWeights()` and initializes or restores a separate session fast state. The
learned gate and residual addition are represented by
`ApplyGatedStateUpdate` rather than hidden inside a neighboring method.

The application currently defaults to pseudocode on both the top-level and nested
architecture pages. Each nested page exposes its existing diagram through a
secondary Diagram tab. The Mermaid source and diagram components remain available
for visual review without displacing the code-first contract.

## Observation input contract

Piro is stateful, so the caller sends only the new observation for the current
turn. The session identifier selects the persistent runtime state; the request
body does not repeat the system prompt, conversation transcript, previous tool
calls, or durable memory.

```text
POST /v1/sessions/{session_id}/observe

{
  "parts": [
    { "type": "text", "text": "What is happening here?" },
    { "type": "image", "uri": "blob://...", "mime_type": "image/png" }
  ],
  "metadata": {
    "source": "ios",
    "captured_at": "2026-07-22T12:00:00Z"
  }
}
```

Supported observation parts are text, image, audio, video, file/document, and
structured JSON/environment data. A tool result may appear as a part when the
environment has just produced it, but the caller does not replay the complete
tool-call history.

## Input embedding contract

`Observation` is the conceptual boundary between the API and the neural model. `PiroInput` is the implementation-level data object that normalizes that boundary. The embedding
stage does not treat every modality as a text token sequence. It routes each part
through a modality-specific encoder, then aligns the resulting features into a
shared representation for the CTM.

```text
PiroInput
  ├── text              → text encoder
  ├── image             → vision encoder
  ├── audio             → audio encoder
  ├── video             → vision + temporal encoder
  ├── file/document     → document/code encoder
  ├── environment event→ structured event encoder
  ├── tool result       → structured output encoder
  └── metadata          → time/source/order signals

modality features → shared Piro representation → CTM input signal
```

The shared representation should preserve modality boundaries, ordering,
timing, and provenance. This is analogous to frontier multimodal models using
separate frontends for text, vision, audio, or tools before projecting those
features into a representation their shared reasoning backbone can consume.

## Reading the contract

### 1. Observation and encoders are the model boundary

`Observation` is the structured multimodal input presented by the API. The implementation represents it as `PiroInput`. Modality-
specific encoders convert its parts into a shared representation without
requiring every input to become a text token sequence.

### 2. The Stateful CTM is the reasoning substrate

The CTM is represented here as first-class components: transient neuron state, a
bounded timestamped history buffer, synchronization-driven local attention, and
repeated thought ticks. `historyₖ` is short-term working memory for the current
process; it is not itself a durable model revision.

### 3. Internal memory is made of weights

Memory is not a required external database or a separate cognitive sidecar. The
model contains state substrates with different lifetimes:

- **Transient thought state (`hₖ`)** supports the current CTM computation.
- **Bounded history (`historyₖ`)** supports local attention over recent working context.
- **Fast weights** adapt quickly while Piro is processing an observed stream.
- **Durable weights** change more slowly as validated evidence is consolidated.

The exact implementation may use different parameterizations, but structurally
both are part of Piro’s own learned state.

### 4. Self-update is part of Piro’s design

The learned self-update mechanism receives the observed chunk, its next-token
prediction, prediction loss, and fast-state eligibility signals. `FastAdaptation`
runs inside the causal observation stream so the updated fast state influences
later chunks in the same episode. This is different from a conventional deployed
frontier model whose optimizer is external and whose weights remain fixed during
ordinary use.

A later observation can also provide delayed local credit for earlier activity,
but delayed credit is not the same as automatic durable persistence.
`PlasticityController` may coordinate that credit; `WeightPersistencePolicy`
controls the boundary at which state is checkpointed or proposed for
consolidation.

An incoming `PiroInput` does not intrinsically identify itself as a “later
consequence.” If the model later finds that an input is relevant to a prior
prediction, that relationship is inferred by the self-update mechanism.

### 5. The pseudocode is not the learning timeline

A separate delayed-credit experiment can still study:

```text
input → internal prediction → output → more input → credit assignment
```

But that sequence is a behavioral explanation. The top-level pseudocode shows the
persistent transformations that make the behavior possible.

## Model components

| Component | Role | Architectural question |
| --- | --- | --- |
| Observation boundary | Structured multimodal input | Which modalities and metadata are canonical? |
| Modality-specific encoders | Convert each input type into features | Which frontends can be trained jointly with the CTM? |
| Shared Piro representation | Align features across modalities | How should modality boundaries and timing be preserved? |
| Stateful CTM | Recurrent thought dynamics | How do repeated ticks improve reasoning and control? |
| Plastic weights | Fast internal memory | What should be eligible for rapid update? |
| Durable weights | Long-term internal memory | What evidence warrants slower consolidation? |
| Learned self-update | Controls weight changes | How should prediction, value, eligibility, and credit shape plasticity? |
| Output | Emit text, tool, and environment actions | How should one shared state support multiple output types? |


## Proposed first experiment

Do not begin with a full language model or unrestricted online weight mutation.
Start with a small environment where the model’s internal update mechanism can
be measured:

1. The model chooses an action from a compact action space.
2. It predicts the next observation and eventual utility.
3. The environment returns observations, not an immediate correctness label.
4. The model maintains an eligibility trace over recent actions.
5. `FastAdaptation` uses next-token prediction loss to update selected BF16 fast-state groups during the observed stream. `WeightPersistencePolicy` may keep that state in runtime memory, checkpoint it at session scope, or pass validated evidence to `ConsolidateWeights`; ordinary fast updates do not rewrite durable model weights.
6. We compare against:
   - no adaptation,
   - immediate reward-only adaptation,
   - full-episode reward assigned uniformly,
   - and an oracle verifier.

The first success criterion is not raw benchmark score. It is whether the model
learns the right earlier action more reliably than the uniform-credit baseline,
while recovering when the environment changes.

## Design questions for feedback

1. Which weight substrates should be plastic on which timescales?
2. Should prediction, value, eligibility, and credit signals be explicit internal
channels, learned latent signals, or both?
3. What is the smallest environment that can test self-updating weights without
confounding the result with a large language interface?
4. How should durable consolidation prevent one surprising input from rewriting
stable knowledge?

These are intentionally left open. The architecture is an end-state representation;
experiments will determine the exact module boundaries and update rules.


## Attention detail contract

```text
Attention(hₖ, historyₖ, x, k, weights):

    memoryₖ = BuildMemorySlots(historyₖ, k)

    syncFeaturesₖ = SummarizeSynchronization(hₖ, historyₖ, weights)

    attentionShape = GetAttentionShape(weights)
    d_head = attentionShape.d_head

    queryₖ = QueryProjection(
        Normalize(Concatenate(hₖ, x, syncFeaturesₖ)),
        weights
    )

    keysₖ = KeyProjection(memoryₖ, weights)
    valuesₖ = ValueProjection(memoryₖ, weights)
    contentScoresₖ = queryₖ · keysₖᵀ / sqrt(d_head)
    timeBiasₖ = RelativeTimeBias(memoryₖ.age, weights)
    syncBiasₖ = SynchronizationBias(hₖ, memoryₖ, weights)
    contextₖ = OutputProjection(
        contentScoresₖ,
        timeBiasₖ,
        syncBiasₖ,
        valuesₖ,
        weights
    )
    readGateₖ = ReadGate(
        hₖ,
        x,
        contextₖ,
        weights
    )

    return readGateₖ ⊙ contextₖ

ReadGate(hₖ, x, contextₖ, weights):

    gateInputₖ = Normalize(Concatenate(hₖ, x, contextₖ))
    gateLogitsₖ = gateInputₖ · weights.attention.readGate.W
        + weights.attention.readGate.b
    readGateₖ = sigmoid(gateLogitsₖ)

    if Shape(readGateₖ) != Shape(contextₖ):
        return Error("read gate cannot be applied to context")

    return readGateₖ

BuildMemorySlots(historyₖ, k):

    memoryₖ = []

    for each entryₜ in historyₖ:
        slotₜ = {
            content: Concatenate(entryₜ.state, entryₜ.input),
            createdAt: entryₜ.tick,
            age: k - entryₜ.tick
        }
        memoryₖ.append(slotₜ)

    return memoryₖ
```
