# Borealis

Borealis is Piro's small durable/adaptation causal language model. It is intentionally
smaller than a Transformer: the current sequence-processing backbone is an
`nn.GRUCell`, while the output head maps the context representation to vocabulary
logits.

## Context state

`context_state` is Borealis's run-local representation of the sequence seen so far.
It has shape `(context_dim,)` and is updated one token at a time:

```text
token id
  -> token embedding
  -> input projection
  -> GRUCell(previous context_state)
  -> next context_state
```

The context state is not a copy of the prompt and is not the model's durable
weights. It is a compressed working representation that lets generation consume
one new token and continue from the previous context without replaying the entire
prompt.

Borealis also carries `BorealisAdaptationState`, which is separate from
`context_state`:

- `context_state` represents sequence context for the recurrent backbone;
- `adaptation_state` contains run-local output-bias adaptation state;
- durable module parameters are the persistent learned model revision.

Together they form `BorealisGenerationState` for an in-progress generation
invocation.

## Invocation phases

### Prompt prefill and adaptation

`prefill(prompt_token_ids)` reads the known prompt and returns a
`BorealisGenerationState`. For every known prompt transition, Borealis can:

1. advance the context state;
2. predict the next observed token;
3. calculate causal cross-entropy;
4. update the adaptation output-bias state.

The final prompt token is then consumed to produce the context state used for the
first generated token.

Generated tokens are not adapted by default because the model does not know the
correct future target after it emits a token. Adapting from a model's own
unverified output would be self-training, not ordinary next-token supervision.

### Output head

`next_token_logits(state)` applies the final readout:

```text
context_state
  -> LayerNorm
  -> context-to-embedding projection
  -> tied token-embedding readout
  -> adaptation output-bias overlay
  -> vocabulary logits
```

The output head produces one score per vocabulary token. It does not produce a
string and it is not the full Transformer-like reasoning stack.

### Autoregressive generation

`generate()` performs deterministic greedy decoding:

```text
state = Prefill(prompt)
for step in range(max_new_tokens):
    logits = OutputHead(state.context_state, state.adaptation_state)
    token = Argmax(logits)
    Emit(token)
    if token == eos_token:
        break
    state = AdvanceGeneration(state, token)
return generated tokens
```

The configured `eos_token_id` is the normal completion signal when present; a
per-call `eos_token_id` can override it. The EOS token is included in the returned
sequence. If no EOS token is configured, `max_new_tokens` is the hard cap and the
caller accepts cap-only termination. Ties use the lowest token ID because
generation uses `torch.argmax`.

`generate_with_state()` returns both the generated token IDs and the
post-invocation `BorealisGenerationState`. Its adaptation state has been
consolidated and cleared at the invocation boundary, while its context state is
detached and safe to carry as an internal value. This state-returning method is
intended for model-level continuation and testing; it is not yet an HTTP
serialization contract.

## Existing model APIs

- `prefill(prompt_token_ids, adaptation_state=None, adapt=True)` returns generation state.
- `next_token_logits(generation_state)` returns one vocabulary-logit vector.
- `advance_generation(generation_state, token)` consumes one generated token.
- `generate(prompt_token_ids, max_new_tokens, ...)` returns only newly generated token IDs.
- `generate_with_state(prompt_token_ids, max_new_tokens, ...)` returns tokens plus final state.
- `run(token_ids, ...)` remains the single-final-logits causal episode used by training and compatibility callers.
- `causal_loss(token_ids)` remains the differentiable training helper.
- `forward(token_ids)` remains equivalent to `run(token_ids, adapt=False)`.

## Tokenizer and text boundary

Borealis follows a real language-model path. Production training fits a
reversible byte-fallback BPE tokenizer capped at an 8,192-token vocabulary from
the source-decoded examples. Its merge table is stored in `BorealisConfig` and
therefore in every persisted training configuration, so serving reconstructs the
same tokenizer without depending on the training corpus being present.

Training constructs complete sequences as:

```text
<input context>\nANSWER:<target><end-of-text>
```

The loss is teacher-forced across every next-token target, not only the final token.
Inference encodes the input plus `target_prefix`, generates token IDs
autoregressively until EOS or `max_new_tokens`, and decodes those IDs with the same
BPE tokenizer before returning the API response. Token IDs remain diagnostic
metadata, while `text` is always decoded model output.

The `byte` tokenizer name is retained only as a small reversible test fixture; it is
not the production tokenizer. `o200k_base` remains supported for explicitly
persisted legacy experiments, but new Borealis training uses `byte_bpe`.
