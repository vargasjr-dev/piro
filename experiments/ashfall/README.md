# Ashfall

Ashfall is Piro's first experiment in the alphabetic experiment series.

Each experiment owns the complete Piro research surface:

- `benchmarks/` — evaluation protocols and reports.
- `sources/` — dataset-generating source programs.
- `architectures/` — model architecture definitions.

The first source is `associative-recall`, which generates ordered
`PiroInput` observation packets for persistent-memory evaluation.

Each JSONL record has this top-level shape, with a variable-length ordered
request sequence containing at least one observation and a final query:

```json
{
  "inputs": [
    { "parts": [{ "type": "text", "text": "key_017 = value_014" }] },
    { "parts": [{ "type": "text", "text": "token_005_027" }] },
    { "parts": [{ "type": "text", "text": "token_011_003" }] },
    { "parts": [{ "type": "text", "text": "key_017" }] }
  ]
}
```

The source defaults to 10,000 records. Modal uses the first 80% (8,000
records) for training and the final 20% (2,000 records) as the validation
holdout. Write and distractor observations are partitioned into varied packet
counts so request histories are not always the same length.

The source does not emit `write`, `distractors`, `query`, `label`, or role
metadata fields, and the observation text contains no `WRITE`, `DISTRACT`, or
`QUERY` markers. The semantic role of each observation is inferable from its
content and ordered position in the input sequence.
