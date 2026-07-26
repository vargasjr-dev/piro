# Borealis

Borealis is Piro's small fast/slow causal language model. It is intentionally
smaller than a Transformer: the current sequence-processing backbone is an
`nn.GRUCell`, while the output head maps the recurrent representation to
vocabulary logits.

## Hidden state

`hidden` is the model's run-local representation of the sequence seen so far.
It has shape `(hidden_dim,)` and is updated one token at a time:

```text
token id
  -> token embedding
  -> input projection
  -> GRUCell(previous hidden)
  -> next hidden
```

The hidden state is not a copy of the prompt and it is not the model's durable
weights. It is a compressed working representation that lets generation consume
one new token and continue from the previous context without replaying the
entire prompt.

Borealis also carries `BorealisFastState`, which is separate from `hidden`:

- `hidden` represents sequence context for the recurrent backbone;
- `fast_state` contains run-local output-bias adaptation state;
- durable module parameters are the slower learned model revision.

Together they form `BorealisGenerationState` for an in-progress generation
invocation.

## Invocation phases

### Prompt prefill and adaptation

`prefill(prompt_token_ids)` reads the known prompt and returns a
`BorealisGenerationState`. For every known prompt transition, Borealis can:

1. advance the hidden state;
2. predict the next observed token;
3. calculate causal cross-entropy;
4. update the fast output-bias state.

The final prompt token is then consumed to produce the hidden state used for the
first generated token.

Generated tokens are not fast-adapted by default because the model does not know
the correct future target after it emits a token. Adapting from a model's own
unverified output would be self-training, not ordinary next-token supervision.

### Output head

`next_token_logits(state)` applies the final readout:

```text
hidden
  -> LayerNorm
  -> durable output_head
  -> fast output-bias overlay
  -> vocabulary logits
```

The output head produces one score per vocabulary token. It does not produce a
string and it is not the full Transformer-like reasoning stack.

### Autoregressive generation

`generate()` performs deterministic greedy decoding:

```text
state = Prefill(prompt)
repeat up to max_new_tokens times:
    logits = OutputHead(state.hidden, state.fast_state)
    token = argmax(logits)
    state = AdvanceGeneration(state, token)
return generated tokens
```

`eos_token_id`, when provided, is included in the returned tokens and stops the
loop. Ties use the lowest token ID because generation uses `torch.argmax`.

`generate_with_state()` returns both the generated token IDs and the
post-invocation `BorealisGenerationState`. Its fast state has been consolidated
and cleared at the invocation boundary, while its hidden state is detached and
safe to carry as an internal value. This state-returning method is intended for
model-level continuation and testing; it is not yet an HTTP serialization
contract.

## Existing model APIs

- `prefill(prompt_token_ids, fast_state=None, adapt=True)` returns generation state.
- `next_token_logits(generation_state)` returns one vocabulary-logit vector.
- `advance_generation(generation_state, token)` consumes one generated token.
- `generate(prompt_token_ids, max_new_tokens, ...)` returns only newly generated token IDs.
- `generate_with_state(prompt_token_ids, max_new_tokens, ...)` returns tokens plus final state.
- `run(token_ids, ...)` remains the single-final-logits causal episode used by training and compatibility callers.
- `causal_loss(token_ids)` remains the differentiable training helper.
- `forward(token_ids)` remains equivalent to `run(token_ids, adapt=False)`.

The model is token-ID based for this experiment. Tokenization and text decoding
belong outside the core architecture so synthetic tasks can use tiny
vocabularies and the recurrent state behavior remains measurable.
