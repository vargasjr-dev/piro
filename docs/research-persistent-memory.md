# Persistent associative memory

Piro's first real memory experiment is a write/query task. Each episode has
three separate invocation inputs:

1. **WRITE** — store several key/value facts.
2. **DISTRACT** — process unrelated tokens for a configurable delay.
3. **QUERY** — retrieve one value by key after the write context is gone.

Example:

```text
Invocation 1:
WRITE key_017 value_004
WRITE key_003 value_021

Invocation 2:
DISTRACT token_012_008
DISTRACT token_004_029
...

Invocation 3:
QUERY key_017
→ value_004
```

The generator returns these prompts separately. A benchmark must not concatenate
them into one context window, because that would test ordinary sequence
completion rather than persistent memory.

## Current benchmark controls

`PersistentMemoryBenchmark` currently measures three conditions:

- retained state across invocations;
- reset state before query;
- serialized state saved after the write/delay and restored before query.

The next evaluation pass should add process restart with no restored state,
distractor-delay and number-of-writes sweeps, plasticity-disabled versus
plasticity-enabled runs, and a full-context control that receives the original
write transcript.

The result is evidence for memory only when retained/restored state succeeds,
while reset or discarded state fails, and the query input itself does not reveal
the answer. The existing single-call tensor trainer is intentionally not used
for this task; it cannot preserve the write/query boundary during optimization.
